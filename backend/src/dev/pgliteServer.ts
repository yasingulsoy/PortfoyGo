import net from 'net';
import type { PGlite } from '@electric-sql/pglite';

/**
 * PGlite'ı PostgreSQL wire protokolüyle (TCP) sunan küçük, SADECE GELİŞTİRME/TEST amaçlı sunucu.
 *
 * Neden @electric-sql/pglite-socket'in PGLiteSocketServer'ı değil?
 * PGlite tek bir oturumdur. pglite-socket çoklu bağlantıyı MESAJ düzeyinde sıraya koyar; bu yüzden
 * eşzamanlı iki bağlantının extended-protocol mesajları (Parse/Bind/Execute/Sync) birbirine
 * karışabilir (ör. A'nın Bind'ı B'nin isimsiz Parse'ına bağlanır). node-postgres Pool'u parametreli
 * sorgularda tam olarak bu deseni kullandığından backend'in eşzamanlı istekleri bozulabiliyordu.
 *
 * Bu sunucu:
 *  - Her bağlantının mesajlarını "senkron noktasına" (Sync / simple Query) kadar bir grup olarak
 *    ATOMİK çalıştırır (gruplar arasına başka bağlantı giremez).
 *  - Açık bir transaction (BEGIN … COMMIT/ROLLBACK) boyunca PGlite'ı o bağlantıya kilitler;
 *    diğer bağlantılar bekler (gerçek Postgres'teki satır kilitlerinin kaba bir karşılığı).
 *  - Transaction sahibi bağlantı uzun süre boşta beklerken (ör. uygulama transaction içindeyken
 *    havuzdan İKİNCİ bir bağlantıyla okuma yapıyorsa) bekleyen, transaction kontrolü İÇERMEYEN
 *    grupları SAVEPOINT içinde o transaction'a "bindirir". Böylece gerçek Postgres'te sorunsuz
 *    çalışan bu desen tek oturumlu PGlite'ta kilitlenmeye (deadlock) dönüşmez.
 *  - Bağlantı transaction ortasında koparsa ROLLBACK yapar.
 *
 * Kısıtlar: COPY, LISTEN/NOTIFY, iptal (CancelRequest) ve SSL desteklenmez. Üretimde KULLANMAYIN.
 */

export interface PgliteServerOptions {
  db: PGlite;
  host?: string;
  /** 0 → işletim sistemi boş bir port seçer */
  port?: number;
  /** Transaction sahibi bu kadar ms boştaysa bekleyen okuma grupları savepoint ile bindirilir */
  piggybackAfterMs?: number;
  debug?: boolean;
}

export interface PgliteServer {
  host: string;
  port: number;
  url: (database?: string) => string;
  stop: () => Promise<void>;
}

const SSL_REQUEST = 80877103;
const GSSENC_REQUEST = 80877104;
const CANCEL_REQUEST = 80877102;
const PROTOCOL_V3 = 196608;

type Message = { type: string; data: Buffer };

/** Grup içindeki SQL metinlerinde transaction kontrol komutu var mı? (bindirme için) */
const TX_CONTROL = /^\s*(BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION)\b/i;

function sqlOf(msg: Message): string | null {
  // 'Q' (Query): int32 len + cstring sql ; 'P' (Parse): int32 len + cstring name + cstring sql + ...
  if (msg.type === 'Q') {
    return msg.data.toString('utf8', 5, msg.data.indexOf(0, 5));
  }
  if (msg.type === 'P') {
    const nameEnd = msg.data.indexOf(0, 5);
    return msg.data.toString('utf8', nameEnd + 1, msg.data.indexOf(0, nameEnd + 1));
  }
  return null;
}

/** Yanıt akışında ErrorResponse ('E') mesajı var mı? */
function containsError(chunks: Uint8Array[]): boolean {
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  let off = 0;
  while (off + 5 <= buf.length) {
    const type = String.fromCharCode(buf[off]);
    const len = buf.readInt32BE(off + 1);
    if (type === 'E') return true;
    off += 1 + len;
  }
  return false;
}

class Conn {
  static nextId = 1;
  readonly id = Conn.nextId++;
  buf = Buffer.alloc(0);
  startupDone = false;
  closed = false;
  /** Bu bağlantının şu an PGlite üzerinde çalışan bir grubu var mı? */
  busy = false;
  /** Son grubunun bittiği an */
  lastDoneAt = Date.now();
  /** İşlenmeyi bekleyen mesajlar (senkron noktasına kadar biriktirilir) */
  pending: Message[] = [];
  chain: Promise<void> = Promise.resolve();
  constructor(readonly socket: net.Socket) {}
}

export async function startPgliteServer(opts: PgliteServerOptions): Promise<PgliteServer> {
  const { db } = opts;
  const host = opts.host ?? '127.0.0.1';
  const piggybackAfterMs = opts.piggybackAfterMs ?? 250;
  const debug = !!opts.debug;
  const log = (...a: unknown[]) => debug && console.log('[pglite-server]', ...a);

  await db.waitReady;

  // --- Startup yanıtı: PGlite'a bir kez gönderilir, her yeni bağlantıya aynısı yanıtlanır ----------
  // (Yeni bağlantının startup'ı başka bir bağlantının transaction'ını beklemesin; tek oturum zaten açık.)
  const startupReply = await (async () => {
    const params = Buffer.from('user\0postgres\0database\0postgres\0\0', 'utf8');
    const msg = Buffer.alloc(8 + params.length);
    msg.writeInt32BE(msg.length, 0);
    msg.writeInt32BE(PROTOCOL_V3, 4);
    params.copy(msg, 8);
    const chunks: Uint8Array[] = [];
    await db.execProtocolRawStream(new Uint8Array(msg), { onRawData: (d) => chunks.push(Buffer.from(d)) });
    const reply = Buffer.concat(chunks);
    // Son mesaj ReadyForQuery ('Z', len 5, durum): her zaman 'I' (boşta) olarak yanıtla
    if (reply.length >= 6 && reply[reply.length - 6] === 0x5a) reply[reply.length - 1] = 0x49;
    return reply;
  })();

  // --- PGlite yürütme kilidi: aynı anda tek bir protokol çağrısı ---------------------------
  let execChain: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = execChain.then(fn, fn);
    execChain = run.catch(() => undefined);
    return run;
  };

  // --- Oturum sahipliği: bir grup / transaction boyunca PGlite tek bağlantıya aittir ----------
  let owner: Conn | null = null;
  const waiters: { conn: Conn; canPiggyback: boolean; resolve: (mode: 'owner' | 'piggyback') => void }[] = [];

  const grant = () => {
    if (owner) return;
    const next = waiters.shift();
    if (next) {
      owner = next.conn;
      next.resolve('owner');
    }
  };

  const release = (conn: Conn) => {
    if (owner === conn) {
      owner = null;
      grant();
    }
  };

  const acquire = (conn: Conn, canPiggyback: boolean): Promise<'owner' | 'piggyback'> => {
    if (owner === null || owner === conn) {
      owner = conn;
      return Promise.resolve('owner');
    }
    return new Promise((resolve) => waiters.push({ conn, canPiggyback, resolve }));
  };

  // Sahip transaction içinde boşta bekliyorsa (uygulama başka bir bağlantıyı bekliyor olabilir)
  // bindirilebilir bekleyenleri serbest bırak.
  const piggybackTimer = setInterval(() => {
    if (!owner || owner.busy || waiters.length === 0) return;
    if (Date.now() - owner.lastDoneAt < piggybackAfterMs) return;
    if (!db.isInTransaction()) return;
    for (let i = 0; i < waiters.length; ) {
      if (waiters[i].canPiggyback) {
        const [w] = waiters.splice(i, 1);
        log(`#${w.conn.id} → #${owner.id} transaction'ına bindiriliyor`);
        w.resolve('piggyback');
      } else {
        i++;
      }
    }
  }, 50);
  piggybackTimer.unref();

  const write = (conn: Conn, data: Uint8Array) => {
    if (data.length > 0 && !conn.closed && conn.socket.writable) {
      conn.socket.write(Buffer.from(data));
    }
  };

  /** Yanıtı atılan basit sorgu (raw protokol üzerinden; db.exec ile karıştırılmaz) */
  const rawSimple = async (sql: string): Promise<boolean> => {
    const body = Buffer.concat([Buffer.from(sql, 'utf8'), Buffer.alloc(1)]);
    const msg = Buffer.alloc(5 + body.length);
    msg.write('Q', 0, 'latin1');
    msg.writeInt32BE(4 + body.length, 1);
    body.copy(msg, 5);
    const out: Uint8Array[] = [];
    await db.execProtocolRawStream(new Uint8Array(msg), { onRawData: (d) => out.push(Buffer.from(d)) });
    return !containsError(out);
  };

  const execMessages = async (conn: Conn, msgs: Message[], sink: (d: Uint8Array) => void) => {
    for (const m of msgs) {
      await db.execProtocolRawStream(new Uint8Array(m.data), { onRawData: sink });
    }
  };

  /** Bir mesaj grubunu (Sync/Query/Flush'a kadar) çalıştırır. */
  const runGroup = async (conn: Conn, msgs: Message[], endsAtSyncPoint: boolean) => {
    const canPiggyback =
      endsAtSyncPoint &&
      conn.startupDone &&
      msgs.every((m) => {
        const sql = sqlOf(m);
        return sql === null || !TX_CONTROL.test(sql);
      });

    const mode = await acquire(conn, canPiggyback);
    if (conn.closed) {
      if (mode === 'owner') release(conn);
      return;
    }

    if (mode === 'piggyback') {
      await exclusive(async () => {
        conn.busy = true;
        const out: Uint8Array[] = [];
        try {
          await rawSimple('SAVEPOINT __pglite_server_piggyback');
          await execMessages(conn, msgs, (d) => out.push(d));
          await rawSimple(
            containsError(out)
              ? 'ROLLBACK TO SAVEPOINT __pglite_server_piggyback'
              : 'RELEASE SAVEPOINT __pglite_server_piggyback'
          );
        } finally {
          conn.busy = false;
        }
        for (const d of out) write(conn, d);
      });
      return;
    }

    await exclusive(async () => {
      conn.busy = true;
      try {
        await execMessages(conn, msgs, (d) => write(conn, d));
      } finally {
        conn.busy = false;
        conn.lastDoneAt = Date.now();
      }
    });
    // Senkron noktasında ve transaction dışındaysak oturumu bırak
    if (endsAtSyncPoint && !db.isInTransaction()) {
      release(conn);
    }
  };

  const cleanup = async (conn: Conn) => {
    if (conn.closed) return;
    conn.closed = true;
    // Bekleme kuyruğundan çıkar
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].conn === conn) waiters.splice(i, 1);
    }
    // Yarım kalan işlerin bitmesini bekle, sonra (gerekirse) transaction'ı geri al
    await conn.chain.catch(() => undefined);
    if (owner === conn) {
      if (db.isInTransaction()) {
        log(`#${conn.id} transaction ortasında koptu → ROLLBACK`);
        await exclusive(() => rawSimple('ROLLBACK')).catch(() => undefined);
      }
      release(conn);
    }
  };

  const enqueue = (conn: Conn, msgs: Message[], endsAtSyncPoint: boolean) => {
    conn.chain = conn.chain
      .then(() => runGroup(conn, msgs, endsAtSyncPoint))
      .catch((err) => {
        log(`#${conn.id} hata:`, err?.message || err);
        conn.socket.destroy();
      });
  };

  const onData = (conn: Conn, chunk: Buffer) => {
    conn.buf = conn.buf.length ? Buffer.concat([conn.buf, chunk]) : chunk;

    while (!conn.closed) {
      if (!conn.startupDone) {
        if (conn.buf.length < 8) return;
        const len = conn.buf.readInt32BE(0);
        if (conn.buf.length < len) return;
        const code = conn.buf.readInt32BE(4);
        conn.buf = conn.buf.subarray(len);
        if (code === SSL_REQUEST || code === GSSENC_REQUEST) {
          conn.socket.write('N');
          continue;
        }
        if (code === CANCEL_REQUEST) {
          conn.socket.end();
          return;
        }
        if (code !== PROTOCOL_V3) {
          conn.socket.destroy();
          return;
        }
        conn.startupDone = true;
        conn.socket.write(startupReply);
        continue;
      }

      if (conn.buf.length < 5) return;
      const type = String.fromCharCode(conn.buf[0]);
      const len = conn.buf.readInt32BE(1);
      if (conn.buf.length < 1 + len) return;
      const data = Buffer.from(conn.buf.subarray(0, 1 + len));
      conn.buf = conn.buf.subarray(1 + len);

      if (type === 'X') {
        // Terminate: PGlite'a iletilmez (tek oturum kapanmasın)
        conn.socket.end();
        return;
      }

      conn.pending.push({ type, data });
      if (type === 'S' || type === 'Q') {
        const msgs = conn.pending;
        conn.pending = [];
        enqueue(conn, msgs, true);
      } else if (type === 'H') {
        const msgs = conn.pending;
        conn.pending = [];
        enqueue(conn, msgs, false);
      }
    }
  };

  const conns = new Set<Conn>();
  const server = net.createServer((socket) => {
    socket.setNoDelay(true);
    const conn = new Conn(socket);
    conns.add(conn);
    log(`#${conn.id} bağlandı`);
    socket.on('data', (chunk) => onData(conn, chunk));
    socket.on('error', () => undefined);
    socket.on('close', () => {
      conns.delete(conn);
      log(`#${conn.id} kapandı`);
      void cleanup(conn);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as net.AddressInfo;

  return {
    host,
    port: address.port,
    url: (database = 'postgres') => `postgres://postgres:postgres@${host}:${address.port}/${database}`,
    stop: async () => {
      clearInterval(piggybackTimer);
      for (const c of conns) c.socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await Promise.all([...conns].map((c) => cleanup(c)));
    },
  };
}
