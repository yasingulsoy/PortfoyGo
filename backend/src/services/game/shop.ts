import pool from '../../config/database';
import { GameError, Queryable, withTx } from './common';
import { DEFAULT_AVATAR, ItemKind, LEDGER_REASONS, Rarity, SHOP_ITEMS, ShopItemDef, TIERS, shopItem, tierFor, tierIndex } from './config';
import { insertLedger } from './ledger';

/**
 * Kozmetik mağazası (game_inventory) — yalnızca oyun içi jetonla; gerçek para yok.
 *  - unlock 'default': herkes sahip (avatar-1..3)
 *  - unlock 'coins'  : jetonla satın alınır
 *  - unlock 'tier'   : arena reyting kademesine ulaşınca açılır (envantere kalıcı eklenir)
 *  - unlock 'wheel'  : yalnızca şans çarkından
 */

export interface ShopItemDto {
  id: string;
  kind: ItemKind;
  name: string;
  price_coins: number | null;
  rarity: Rarity;
  owned: boolean;
  equipped: boolean;
  unlock: { type: 'coins' | 'tier' | 'wheel' | 'default'; value?: number | string };
}

export function tierReached(rating: number, tierId: string): boolean {
  return tierIndex(tierFor(rating).id) >= tierIndex(tierId);
}

/** Ulaşılan kademelerin çerçevelerini envantere ekler (reyting sonradan düşse de kalır). */
export async function syncTierItems(db: Queryable, userId: string, rating: number): Promise<string[]> {
  const ids = SHOP_ITEMS.filter((i) => i.unlock.type === 'tier' && tierReached(rating, i.unlock.value)).map((i) => i.id);
  if (ids.length === 0) return [];
  const r = await db.query(
    `INSERT INTO game_inventory (user_id, item_id)
     SELECT $1, x FROM unnest($2::text[]) AS x
     ON CONFLICT (user_id, item_id) DO NOTHING
     RETURNING item_id`,
    [userId, ids]
  );
  return r.rows.map((x: any) => String(x.item_id));
}

async function ownedSet(db: Queryable, userId: string): Promise<{ owned: Set<string>; user: any }> {
  const u = await db.query(`SELECT coins, arena_rating, avatar_id, frame_id, title_id FROM users WHERE id = $1`, [userId]);
  const user = u.rows[0];
  if (!user) throw new GameError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
  const inv = await db.query(`SELECT item_id FROM game_inventory WHERE user_id = $1`, [userId]);
  const owned = new Set<string>(inv.rows.map((r: any) => String(r.item_id)));
  for (const item of SHOP_ITEMS) {
    if (item.unlock.type === 'default') owned.add(item.id);
    if (item.unlock.type === 'tier' && tierReached(Number(user.arena_rating), item.unlock.value)) owned.add(item.id);
  }
  return { owned, user };
}

function toDto(item: ShopItemDef, owned: Set<string>, user: any): ShopItemDto {
  const equipped =
    (item.kind === 'avatar' && (user.avatar_id ?? DEFAULT_AVATAR) === item.id) ||
    (item.kind === 'frame' && user.frame_id === item.id) ||
    (item.kind === 'title' && user.title_id === item.id);
  const u = item.unlock;
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    price_coins: u.type === 'coins' ? u.value : null,
    rarity: item.rarity,
    owned: owned.has(item.id),
    equipped,
    unlock: u.type === 'coins' || u.type === 'tier' ? { type: u.type, value: u.value } : { type: u.type },
  };
}

export class Shop {
  static async list(userId: string): Promise<{ items: ShopItemDto[]; coins: number }> {
    const { owned, user } = await ownedSet(pool, userId);
    await syncTierItems(pool, userId, Number(user.arena_rating));
    return { items: SHOP_ITEMS.map((i) => toDto(i, owned, user)), coins: Number(user.coins) };
  }

  static async buy(userId: string, itemId: string): Promise<{ item: ShopItemDto }> {
    const item = shopItem(itemId);
    if (!item) throw new GameError(404, 'Ürün bulunamadı', 'ITEM_NOT_FOUND');
    return withTx(null, async (c) => {
      // Satır kilidi: aynı kullanıcının eşzamanlı satın almaları sıraya girer
      await c.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      const { owned, user } = await ownedSet(c, userId);
      const u = item.unlock;
      if (u.type === 'tier') {
        if (!tierReached(Number(user.arena_rating), u.value)) {
          const label = TIERS.find((t) => t.id === u.value)?.label ?? u.value;
          throw new GameError(403, `Bu öğe ${label} kademesine ulaşınca açılır`, 'ITEM_LOCKED', { required_tier: u.value });
        }
        const ins = await c.query(
          `INSERT INTO game_inventory (user_id, item_id) VALUES ($1, $2) ON CONFLICT (user_id, item_id) DO NOTHING RETURNING item_id`,
          [userId, item.id]
        );
        if (ins.rows.length === 0) throw new GameError(409, 'Bu öğeye zaten sahipsin', 'ALREADY_OWNED');
        owned.add(item.id);
        return { item: toDto(item, owned, user) };
      }
      if (owned.has(item.id) || u.type === 'default') throw new GameError(409, 'Bu öğeye zaten sahipsin', 'ALREADY_OWNED');
      if (u.type === 'wheel') throw new GameError(403, 'Bu öğe yalnızca şans çarkından kazanılabilir', 'ITEM_LOCKED');

      const price = u.value;
      const upd = await c.query(`UPDATE users SET coins = coins - $2 WHERE id = $1 AND coins >= $2 RETURNING coins`, [userId, price]);
      if (upd.rows.length === 0) {
        throw new GameError(400, 'Yeterli jetonun yok', 'INSUFFICIENT_COINS', { price_coins: price, coins: Number(user.coins) });
      }
      const ins = await c.query(
        `INSERT INTO game_inventory (user_id, item_id) VALUES ($1, $2) ON CONFLICT (user_id, item_id) DO NOTHING RETURNING item_id`,
        [userId, item.id]
      );
      if (ins.rows.length === 0) throw new GameError(409, 'Bu öğeye zaten sahipsin', 'ALREADY_OWNED');
      await insertLedger(c, userId, { coins: -price, xp: 0, reason: LEDGER_REASONS.shop, ref_type: 'item', ref_id: item.id });
      owned.add(item.id);
      return { item: toDto(item, owned, { ...user, coins: Number(upd.rows[0].coins) }) };
    });
  }

  /** undefined → değişmez; frame_id / title_id için null → çıkarır. avatar_id null olamaz. */
  static async equip(userId: string, input: { avatar_id?: string | null; frame_id?: string | null; title_id?: string | null }): Promise<void> {
    const { owned } = await ownedSet(pool, userId);
    const sets: string[] = [];
    const params: unknown[] = [userId];
    const check = (field: 'avatar_id' | 'frame_id' | 'title_id', kind: ItemKind) => {
      const v = input[field];
      if (v === undefined) return;
      if (v === null) {
        if (kind === 'avatar') throw new GameError(400, 'Avatar boş bırakılamaz', 'VALIDATION_ERROR');
        params.push(null);
        sets.push(`${field} = $${params.length}`);
        return;
      }
      const item = shopItem(v);
      if (!item || item.kind !== kind) throw new GameError(400, 'Geçersiz kozmetik seçimi', 'INVALID_ITEM');
      if (!owned.has(item.id)) throw new GameError(403, 'Bu öğeye sahip değilsin', 'ITEM_NOT_OWNED');
      params.push(item.id);
      sets.push(`${field} = $${params.length}`);
    };
    check('avatar_id', 'avatar');
    check('frame_id', 'frame');
    check('title_id', 'title');
    if (sets.length === 0) throw new GameError(400, 'Değiştirilecek bir alan gönderin', 'VALIDATION_ERROR');
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params);
  }
}
