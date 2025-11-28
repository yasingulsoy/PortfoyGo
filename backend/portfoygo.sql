--
-- PostgreSQL database dump
--

\restrict 2G92Rp319zJZJ4JX06P4CAqmaCXBuJjDBdMWd7FMZlpxqOuMDVBK9Weuzr69Ndm

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    activity_type character varying(50) NOT NULL,
    description text NOT NULL,
    metadata jsonb,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.activity_logs OWNER TO postgres;

--
-- Name: badges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.badges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    icon character varying(50) NOT NULL,
    category character varying(50) NOT NULL,
    condition_type character varying(50) NOT NULL,
    condition_value numeric(15,2),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.badges OWNER TO postgres;

--
-- Name: TABLE badges; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.badges IS 'Rozet tanımları tablosu';


--
-- Name: COLUMN badges.condition_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.badges.condition_type IS 'Rozet kazanma koşulu tipi';


--
-- Name: COLUMN badges.condition_value; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.badges.condition_value IS 'Rozet kazanma koşulu değeri';


--
-- Name: competition_participants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.competition_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    competition_id uuid NOT NULL,
    user_id uuid NOT NULL,
    starting_balance numeric(15,2) DEFAULT 100000.00 NOT NULL,
    final_balance numeric(15,2),
    final_portfolio_value numeric(15,2),
    total_value numeric(15,2),
    rank integer,
    prize numeric(15,2) DEFAULT 0,
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.competition_participants OWNER TO postgres;

--
-- Name: competitions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.competitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type character varying(20) NOT NULL,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying,
    prize_pool numeric(15,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT competitions_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT competitions_type_check CHECK (((type)::text = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying])::text[])))
);


ALTER TABLE public.competitions OWNER TO postgres;

--
-- Name: TABLE competitions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.competitions IS 'Yarışmalar tablosu';


--
-- Name: COLUMN competitions.type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.competitions.type IS 'Yarışma tipi: daily, weekly, monthly';


--
-- Name: email_verifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    verification_code character varying(6) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.email_verifications OWNER TO postgres;

--
-- Name: TABLE email_verifications; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.email_verifications IS 'Email doğrulama kodları tablosu';


--
-- Name: market_data_cache; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.market_data_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_type character varying(10) NOT NULL,
    symbol character varying(20) NOT NULL,
    name character varying(255) NOT NULL,
    price numeric(15,2) NOT NULL,
    change numeric(15,2) DEFAULT 0 NOT NULL,
    change_percent numeric(10,4) DEFAULT 0 NOT NULL,
    volume bigint DEFAULT 0,
    market_cap bigint DEFAULT 0,
    previous_close numeric(15,2),
    open_price numeric(15,2),
    high_price numeric(15,2),
    low_price numeric(15,2),
    metadata jsonb,
    cached_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone NOT NULL,
    CONSTRAINT market_data_cache_asset_type_check CHECK (((asset_type)::text = ANY ((ARRAY['stock'::character varying, 'crypto'::character varying])::text[])))
);


ALTER TABLE public.market_data_cache OWNER TO postgres;

--
-- Name: portfolio_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.portfolio_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    symbol character varying(20) NOT NULL,
    name character varying(255) NOT NULL,
    asset_type character varying(10) NOT NULL,
    quantity numeric(20,8) DEFAULT 0 NOT NULL,
    average_price numeric(15,2) DEFAULT 0 NOT NULL,
    current_price numeric(15,2) DEFAULT 0 NOT NULL,
    total_value numeric(15,2) DEFAULT 0 NOT NULL,
    profit_loss numeric(15,2) DEFAULT 0 NOT NULL,
    profit_loss_percent numeric(10,4) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT portfolio_items_asset_type_check CHECK (((asset_type)::text = ANY ((ARRAY['crypto'::character varying, 'stock'::character varying])::text[])))
);


ALTER TABLE public.portfolio_items OWNER TO postgres;

--
-- Name: TABLE portfolio_items; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.portfolio_items IS 'Kullanıcı portföy öğeleri (hisse senetleri ve kripto paralar)';


--
-- Name: COLUMN portfolio_items.asset_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.portfolio_items.asset_type IS 'Varlık tipi: crypto veya stock';


--
-- Name: COLUMN portfolio_items.quantity; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.portfolio_items.quantity IS 'Miktar (kripto için ondalık destekli)';


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type character varying(4) NOT NULL,
    symbol character varying(20) NOT NULL,
    name character varying(255) NOT NULL,
    asset_type character varying(10) NOT NULL,
    quantity numeric(20,8) NOT NULL,
    price numeric(15,2) NOT NULL,
    total_amount numeric(15,2) NOT NULL,
    commission numeric(15,2) DEFAULT 0 NOT NULL,
    net_amount numeric(15,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT transactions_asset_type_check CHECK (((asset_type)::text = ANY ((ARRAY['crypto'::character varying, 'stock'::character varying])::text[]))),
    CONSTRAINT transactions_type_check CHECK (((type)::text = ANY ((ARRAY['buy'::character varying, 'sell'::character varying])::text[])))
);


ALTER TABLE public.transactions OWNER TO postgres;

--
-- Name: TABLE transactions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.transactions IS 'İşlem geçmişi tablosu';


--
-- Name: COLUMN transactions.type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.type IS 'İşlem tipi: buy (alış) veya sell (satış)';


--
-- Name: COLUMN transactions.commission; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.commission IS 'Komisyon ücreti';


--
-- Name: COLUMN transactions.net_amount; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.net_amount IS 'Net tutar (komisyon dahil)';


--
-- Name: user_badges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_badges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    badge_id uuid NOT NULL,
    earned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_badges OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    email_verified boolean DEFAULT false,
    verification_code character varying(6),
    verification_code_expires_at timestamp without time zone,
    balance numeric(15,2) DEFAULT 100000.00,
    portfolio_value numeric(15,2) DEFAULT 0.00,
    total_profit_loss numeric(15,2) DEFAULT 0.00,
    rank integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_login timestamp without time zone,
    is_admin boolean DEFAULT false,
    is_banned boolean DEFAULT false
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.users IS 'Kullanıcı bilgileri tablosu';


--
-- Name: COLUMN users.balance; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.users.balance IS 'Kullanıcının bakiyesi (varsayılan: 100,000 TL)';


--
-- Name: COLUMN users.portfolio_value; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.users.portfolio_value IS 'Portföyün toplam değeri';


--
-- Name: COLUMN users.total_profit_loss; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.users.total_profit_loss IS 'Toplam kar/zarar';


--
-- Data for Name: activity_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.activity_logs (id, user_id, activity_type, description, metadata, ip_address, user_agent, created_at) FROM stdin;
3ad5828f-ef85-410c-825f-ea16a49271cf	7827cb33-45aa-48f2-bd2b-f06b28632e03	login	Kullanıcı giriş yaptı	{"email": "yasingulsoy02@gmail.com", "username": "yasin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	2025-11-14 16:53:41.972494
ec9f4cec-378e-46aa-8107-e806950051ae	707d3fe9-aa92-4a63-a5c1-f366c83eb993	login	Kullanıcı giriş yaptı	{"email": "burak.altinkaya@hospitadent.com", "username": "hburaka"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	2025-11-14 17:12:22.990419
35b45ddf-b187-4eac-8ae4-61534cd9b386	707d3fe9-aa92-4a63-a5c1-f366c83eb993	buy	1 adet Microsoft Corp (MSFT) alındı	{"name": "Microsoft Corp", "price": 16356.925000000001, "symbol": "MSFT", "quantity": 1, "asset_type": "crypto", "commission": 40.8923125, "net_amount": 16397.8173125, "total_amount": 16356.925000000001, "transaction_id": "d79e08b8-82d5-485f-98d3-ddef44265676"}	\N	\N	2025-11-14 17:12:49.450504
aa41704e-d7fd-4209-bc14-9e3f1deedb42	707d3fe9-aa92-4a63-a5c1-f366c83eb993	login	Kullanıcı giriş yaptı	{"email": "burak.altinkaya@hospitadent.com", "username": "hburaka"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	2025-11-14 17:23:56.61378
1939a5e6-44b7-48d7-ba41-b1e3d8d9c47d	707d3fe9-aa92-4a63-a5c1-f366c83eb993	login	Kullanıcı giriş yaptı	{"email": "burak.altinkaya@hospitadent.com", "username": "hburaka"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	2025-11-14 17:43:18.905347
05d68b24-0469-4bf1-b4d8-b2d80dc0ca09	707d3fe9-aa92-4a63-a5c1-f366c83eb993	login	Kullanıcı giriş yaptı	{"email": "burak.altinkaya@hospitadent.com", "username": "hburaka"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	2025-11-14 17:45:57.395659
c56b3753-05cb-40e6-82b0-eda0a69765be	707d3fe9-aa92-4a63-a5c1-f366c83eb993	sell	0.5 adet Microsoft Corp (MSFT) satıldı	{"name": "Microsoft Corp", "price": 16356.93, "symbol": "MSFT", "quantity": 0.5, "asset_type": "crypto", "commission": 20.4461625, "net_amount": 8158.0188375, "total_amount": 8178.465, "transaction_id": "7e8de418-14dc-4579-a29a-fe4cfe92267c"}	\N	\N	2025-11-14 17:46:51.808378
727a8cf4-ec3c-40ed-889f-8ca6b7d34aec	7827cb33-45aa-48f2-bd2b-f06b28632e03	login	Kullanıcı giriş yaptı	{"email": "yasingulsoy02@gmail.com", "username": "yasin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	2025-11-14 17:48:41.666459
57b542b5-f0aa-481f-a93e-eb97051d7c9c	7827cb33-45aa-48f2-bd2b-f06b28632e03	login	Kullanıcı giriş yaptı	{"email": "yasingulsoy02@gmail.com", "username": "yasin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	2025-11-14 17:49:32.320596
0a171a9b-4ead-4f4b-bf92-c16dafd28a40	7827cb33-45aa-48f2-bd2b-f06b28632e03	buy	1.2 adet Apple Inc (AAPL) alındı	{"name": "Apple Inc", "price": 8792.224999999999, "symbol": "AAPL", "quantity": 1.2, "asset_type": "crypto", "commission": 26.376674999999995, "net_amount": 10577.046674999998, "total_amount": 10550.669999999998, "transaction_id": "b89af9c7-d3b5-4ff8-8b7d-d64c59945166"}	\N	\N	2025-11-14 17:50:18.223515
b05007fa-85cd-4fcc-84e4-cc8da3ede249	7827cb33-45aa-48f2-bd2b-f06b28632e03	sell	0.8 adet Apple Inc (AAPL) satıldı	{"name": "Apple Inc", "price": 8792.22, "symbol": "AAPL", "quantity": 0.8, "asset_type": "crypto", "commission": 17.58444, "net_amount": 7016.19156, "total_amount": 7033.776, "transaction_id": "c9aa6577-ebb6-490b-8b08-c362f3a02abc"}	\N	\N	2025-11-14 17:52:01.922135
73677b50-944c-4059-91c5-13c656f50e7e	7827cb33-45aa-48f2-bd2b-f06b28632e03	sell	1.4 adet Apple Inc (AAPL) satıldı	{"name": "Apple Inc", "price": 8792.22, "symbol": "AAPL", "quantity": 1.4, "asset_type": "crypto", "commission": 30.772769999999998, "net_amount": 12278.335229999999, "total_amount": 12309.107999999998, "transaction_id": "fc24d5a9-7707-45ca-9bac-f09b629068f3"}	\N	\N	2025-11-14 17:52:46.222869
875ace35-9bb6-4281-b9a3-fa7316421b65	7827cb33-45aa-48f2-bd2b-f06b28632e03	login	Kullanıcı giriş yaptı	{"email": "yasingulsoy02@gmail.com", "username": "yasin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	2025-11-17 18:33:04.108568
4e14b490-e084-411c-997e-c9b6116f976b	7827cb33-45aa-48f2-bd2b-f06b28632e03	login	Kullanıcı giriş yaptı	{"email": "yasingulsoy02@gmail.com", "username": "yasin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	2025-11-17 19:57:17.780945
8d8c44e9-735d-4c83-b713-1b997b2f2bef	7827cb33-45aa-48f2-bd2b-f06b28632e03	login	Kullanıcı giriş yaptı	{"email": "yasingulsoy02@gmail.com", "username": "yasin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	2025-11-17 20:42:34.441542
122df517-99ad-4712-907b-0ab4ca9468fd	707d3fe9-aa92-4a63-a5c1-f366c83eb993	login	Kullanıcı giriş yaptı	{"email": "burak.altinkaya@hospitadent.com", "username": "hburaka"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	2025-11-17 20:44:13.647088
bedaa980-852f-42eb-a6f4-7d439acb9200	7827cb33-45aa-48f2-bd2b-f06b28632e03	login	Kullanıcı giriş yaptı	{"email": "yasingulsoy02@gmail.com", "username": "yasin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0	2025-11-26 10:54:24.41581
ecda90d8-56cc-45f0-b0d9-f6f244b1c64e	7827cb33-45aa-48f2-bd2b-f06b28632e03	buy	3.57567 adet Meta Platforms Inc (META) alındı	{"name": "Meta Platforms Inc", "price": 20677.15, "symbol": "META", "quantity": 3.57567, "asset_type": "crypto", "commission": 184.83666235125003, "net_amount": 74119.50160285126, "total_amount": 73934.6649405, "transaction_id": "97e46f82-25f4-499b-b8f9-88d7dd7593d5"}	\N	\N	2025-11-26 10:54:47.290605
9dbd91a9-cd22-49ee-9561-078d16fe290d	7827cb33-45aa-48f2-bd2b-f06b28632e03	login	Kullanıcı giriş yaptı	{"email": "yasingulsoy02@gmail.com", "username": "yasin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0	2025-11-26 10:59:22.936895
13e70c79-7738-4eb4-8703-bf41675e5857	7827cb33-45aa-48f2-bd2b-f06b28632e03	login	Kullanıcı giriş yaptı	{"email": "yasingulsoy02@gmail.com", "username": "yasin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0	2025-11-26 11:00:26.345654
256a9bce-edc2-4dee-8c0a-c1cef10f67db	707d3fe9-aa92-4a63-a5c1-f366c83eb993	login	Kullanıcı giriş yaptı	{"email": "burak.altinkaya@hospitadent.com", "username": "hburaka"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0	2025-11-26 11:01:13.017466
bf361bb0-5d45-453f-9f93-f771a0169aaa	7827cb33-45aa-48f2-bd2b-f06b28632e03	login	Kullanıcı giriş yaptı	{"email": "yasingulsoy02@gmail.com", "username": "yasin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0	2025-11-26 11:02:22.428582
2e42333f-edcd-456e-8342-3f18278aee34	7827cb33-45aa-48f2-bd2b-f06b28632e03	login	Kullanıcı giriş yaptı	{"email": "yasingulsoy02@gmail.com", "username": "yasin"}	::1	Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1	2025-11-26 11:06:06.43704
1273b6c1-7a12-467b-a7b1-12e77d230ac6	7827cb33-45aa-48f2-bd2b-f06b28632e03	buy	0.45 adet BNB (BNB) alındı	{"name": "BNB", "price": 27921.725, "symbol": "BNB", "quantity": 0.45, "asset_type": "crypto", "commission": 31.411940625, "net_amount": 12596.188190624998, "total_amount": 12564.776249999999, "transaction_id": "b2336f06-557d-43bb-ade2-70f6a91f1745"}	\N	\N	2025-11-26 11:07:14.337907
beb0b1a8-bd9b-4048-9e4c-f12de973c93f	7827cb33-45aa-48f2-bd2b-f06b28632e03	login	Kullanıcı giriş yaptı	{"email": "yasingulsoy02@gmail.com", "username": "yasin"}	::1	Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1	2025-11-26 11:19:13.062842
c13638b7-7aa2-46bc-a5bd-f79d83027493	7827cb33-45aa-48f2-bd2b-f06b28632e03	login	Kullanıcı giriş yaptı	{"email": "yasingulsoy02@gmail.com", "username": "yasin"}	::1	Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1	2025-11-26 11:38:53.606382
\.


--
-- Data for Name: badges; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.badges (id, name, description, icon, category, condition_type, condition_value, created_at) FROM stdin;
ecdb888c-af22-4495-b6dd-4ed9ef836594	İlk İşlem	İlk alış veya satış işlemini yap	🎯	transaction	transaction_count	1.00	2025-11-14 15:26:28.928381
62e88e67-3d77-4199-91d8-8906be110dca	İlk Kâr	İlk kârlı işlemini yap	💰	profit	profit_count	1.00	2025-11-14 15:26:28.928381
d1eb53f3-6db9-42cf-80a6-c741c11a82b9	10 İşlem	10 işlem tamamla	📊	transaction	transaction_count	10.00	2025-11-14 15:26:28.928381
22b29416-aa27-4aba-9fc9-af540322ee05	100 İşlem	100 işlem tamamla	🔥	transaction	transaction_count	100.00	2025-11-14 15:26:28.928381
ca7c5fce-1675-43ac-9f7c-b0299c4de503	1,000 İşlem	1,000 işlem tamamla	💎	transaction	transaction_count	1000.00	2025-11-14 15:26:28.928381
a8ff4d19-f438-422e-9224-62391fd688a4	10K Kâr	10,000 TL kâr et	💵	profit	profit_amount	10000.00	2025-11-14 15:26:28.928381
4611bacf-daae-4bdd-9def-64ab4a6b55b8	100K Kâr	100,000 TL kâr et	💸	profit	profit_amount	100000.00	2025-11-14 15:26:28.928381
d702e50f-3319-46d2-b745-144e4b56e0b0	Milyoner	1,000,000 TL portföy değerine ulaş	🏆	portfolio	portfolio_value	1000000.00	2025-11-14 15:26:28.928381
003f3429-ad9e-4d30-83e1-1b450bbd2a70	Günlük Trader	Bir günde 10+ işlem yap	⚡	daily	daily_transaction_count	10.00	2025-11-14 15:26:28.928381
050b3bd1-81aa-4954-8bc9-6477569d6de8	Risk Alıcı	Tek işlemde 50,000+ TL yatır	🎲	risk	single_transaction_amount	50000.00	2025-11-14 15:26:28.928381
edb17df3-fc8b-465b-ad44-d65857783ad0	Sabırlı Yatırımcı	30 gün pozisyon tut	⏳	patience	holding_days	30.00	2025-11-14 15:26:28.928381
24fec78f-4c5a-4005-a698-411aa9f50611	Çeşitlendirici	10+ farklı varlık al	🌈	diversity	unique_assets	10.00	2025-11-14 15:26:28.928381
\.


--
-- Data for Name: competition_participants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.competition_participants (id, competition_id, user_id, starting_balance, final_balance, final_portfolio_value, total_value, rank, prize, joined_at) FROM stdin;
\.


--
-- Data for Name: competitions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.competitions (id, type, start_date, end_date, status, prize_pool, created_at) FROM stdin;
\.


--
-- Data for Name: email_verifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_verifications (id, user_id, email, verification_code, expires_at, used, created_at) FROM stdin;
\.


--
-- Data for Name: market_data_cache; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.market_data_cache (id, asset_type, symbol, name, price, change, change_percent, volume, market_cap, previous_close, open_price, high_price, low_price, metadata, cached_at, expires_at) FROM stdin;
66915da9-6dea-4c7c-94ab-f17930179f84	stock	META	Meta Platforms Inc	636.22	23.17	3.7795	0	1497823	613.05	624.00	637.05	618.30	{"symbol": "META"}	2025-11-26 12:58:07.559467	2025-11-26 13:58:04.476
e023dff8-12ea-460e-b5b2-fc989b6f9941	stock	NVDA	NVIDIA Corp	177.82	-4.73	-2.5911	0	4346784	182.55	174.91	178.16	169.55	{"symbol": "NVDA"}	2025-11-26 12:58:07.559467	2025-11-26 13:58:04.477
6446c299-ca06-4210-a597-340ee705bd6c	crypto	BNB	BNB	852.88	0.89	0.1048	1347527113	117495170482	\N	\N	\N	\N	{"id": "binancecoin", "image": "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.789
d2a1eebd-1b93-408e-8a59-67fab2d93338	crypto	STETH	Lido Staked Ether	2900.32	17.00	0.5860	39030890	25039951223	\N	\N	\N	\N	{"id": "staked-ether", "image": "https://coin-images.coingecko.com/coins/images/13442/large/steth_logo.png?1696513206"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.792
f8ad8c50-fa2d-4b1f-955d-d184d53742e8	crypto	FIGR_HELOC	Figure Heloc	1.01	-0.03	-2.8459	807086292	13962100106	\N	\N	\N	\N	{"id": "figure-heloc", "image": "https://coin-images.coingecko.com/coins/images/68480/large/figure.png?1755863954"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.793
6b5ec778-cb28-49bd-a5ef-391e512b934e	crypto	WBT	WhiteBIT Coin	57.31	0.17	0.3040	116760031	12301825080	\N	\N	\N	\N	{"id": "whitebit", "image": "https://coin-images.coingecko.com/coins/images/27045/large/wbt_token.png?1696526096"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.794
f0d25d97-3ef9-4bb3-aeb7-f7d2a91c1825	crypto	WSTETH	Wrapped stETH	3541.20	24.28	0.6855	56679697	11699157585	\N	\N	\N	\N	{"id": "wrapped-steth", "image": "https://coin-images.coingecko.com/coins/images/18834/large/wstETH.png?1696518295"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.794
cebf0c57-c7b9-46cb-88de-5bd56c6846e0	crypto	SOL	Solana	136.53	0.48	0.3504	4912709238	76329514851	\N	\N	\N	\N	{"id": "solana", "image": "https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.79
8e06ada9-0f9c-479a-bb8a-a50a0cfd8e38	crypto	USDC	USDC	1.00	0.00	0.0005	5222534786	75198484004	\N	\N	\N	\N	{"id": "usd-coin", "image": "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png?1696506694"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.791
236cbc44-9311-403a-9421-fe85bd21bc40	crypto	TRX	TRON	0.27	0.00	0.6577	585896170	25949379093	\N	\N	\N	\N	{"id": "tron", "image": "https://coin-images.coingecko.com/coins/images/1094/large/tron-logo.png?1696502193"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.791
f35cab22-656d-4345-bf7d-eaa28eb8cbb3	stock	AAPL	Apple Inc	276.97	1.05	0.3805	0	4092606	275.92	275.27	280.38	275.25	{"symbol": "AAPL"}	2025-11-26 12:58:07.559467	2025-11-26 13:58:04.475
f9bdc80c-8b66-4aea-be29-8e080472c63a	stock	MSFT	Microsoft Corp	476.99	2.99	0.6308	0	3545169	474.00	474.07	479.15	464.89	{"symbol": "MSFT"}	2025-11-26 12:58:07.559467	2025-11-26 13:58:04.475
cee2dc61-bf5c-447c-a8f5-a19ab02e592e	stock	GOOGL	Alphabet Inc	323.44	4.86	1.5255	0	3843710	318.58	326.21	328.83	317.65	{"symbol": "GOOGL"}	2025-11-26 12:58:07.559467	2025-11-26 13:58:04.476
ea34c1bc-7ea0-4d9e-b225-aaadb49d063b	stock	AMZN	Amazon.com Inc	229.67	3.39	1.4981	0	2455221	226.28	226.38	230.52	223.80	{"symbol": "AMZN"}	2025-11-26 12:58:07.559467	2025-11-26 13:58:04.476
2902acb9-48ca-4571-8475-b62857f502ee	stock	TSLA	Tesla Inc	419.40	1.62	0.3878	0	1394848	417.78	414.42	420.48	405.95	{"symbol": "TSLA"}	2025-11-26 12:58:07.559467	2025-11-26 13:58:04.476
2542f2d3-faa7-4382-a1bc-d95e000ebedd	stock	NFLX	Netflix Inc	104.40	-2.57	-2.4025	0	442376	106.97	106.12	106.30	103.82	{"symbol": "NFLX"}	2025-11-26 12:58:07.559467	2025-11-26 13:58:04.477
8b68bb9c-9861-46ae-afcf-652830136047	stock	AMD	Advanced Micro Devices Inc	206.13	-8.92	-4.1479	0	335588	215.05	201.48	206.58	194.28	{"symbol": "AMD"}	2025-11-26 12:58:07.559467	2025-11-26 13:58:04.477
f24f40a6-3b64-487e-a44c-0a12c3c552f3	stock	INTC	Intel Corp	35.83	0.04	0.1118	0	170909	35.79	35.55	36.13	34.68	{"symbol": "INTC"}	2025-11-26 12:58:07.559467	2025-11-26 13:58:04.477
3df2f3cb-3196-4754-9797-8b1ed12af3eb	crypto	ETH	Ethereum	2902.41	16.21	0.5586	21622160209	350667497155	\N	\N	\N	\N	{"id": "ethereum", "image": "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.788
85ac7fc3-cdc9-4c6c-b32d-8e3de6d961ab	crypto	USDT	Tether	1.00	0.00	-0.0123	80593336860	184491546991	\N	\N	\N	\N	{"id": "tether", "image": "https://coin-images.coingecko.com/coins/images/325/large/Tether.png?1696501661"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.788
e1ce1fc7-f89e-4101-9468-d8ffb4ce985d	crypto	WBETH	Wrapped Beacon ETH	3143.40	13.02	0.4144	6348170	10270380609	\N	\N	\N	\N	{"id": "wrapped-beacon-eth", "image": "https://coin-images.coingecko.com/coins/images/30061/large/wbeth-icon.png?1696528983"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.796
ebb17a60-1df2-439b-af99-af40493f5428	crypto	HYPE	Hyperliquid	33.97	0.50	1.4783	499553978	9218444664	\N	\N	\N	\N	{"id": "hyperliquid", "image": "https://coin-images.coingecko.com/coins/images/50882/large/hyperliquid.jpg?1729431300"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.797
62ab13ae-72fd-4d6d-888c-b73c571065bd	crypto	LINK	Chainlink	12.89	0.10	0.8021	636316135	8984797991	\N	\N	\N	\N	{"id": "chainlink", "image": "https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png?1760023405"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.798
85452dd0-d8e7-4f5f-a9f8-5c258d655f65	crypto	ZEC	Zcash	499.14	-15.16	-3.0371	1081600133	8180247111	\N	\N	\N	\N	{"id": "zcash", "image": "https://coin-images.coingecko.com/coins/images/486/large/circle-zcash-color.png?1696501740"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.8
6e7d51a8-456d-44ee-94dc-94f247c146cf	crypto	WBTC	Wrapped Bitcoin	86762.00	-186.08	-0.2145	186616066	10832864062	\N	\N	\N	\N	{"id": "wrapped-bitcoin", "image": "https://coin-images.coingecko.com/coins/images/7598/large/wrapped_bitcoin_wbtc.png?1696507857"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.795
57d03070-1412-43f8-b437-59198e08705f	crypto	XRP	XRP	2.17	-0.02	-1.0573	4054670939	131058263480	\N	\N	\N	\N	{"id": "ripple", "image": "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.789
eba1235f-6f4a-4daf-b9cb-f1239ed69402	crypto	BTC	Bitcoin	86765.00	-269.80	-0.3110	62688123989	1732109167401	\N	\N	\N	\N	{"id": "bitcoin", "image": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.787
51f7f12a-65f5-495b-80bd-99ffe35eb5c8	crypto	DOGE	Dogecoin	0.15	0.00	1.1765	1534635404	22812124410	\N	\N	\N	\N	{"id": "dogecoin", "image": "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?1696501409"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.792
cfd243dc-c540-4d40-958b-586c9446083f	crypto	ADA	Cardano	0.42	0.00	0.2400	756171796	15280097963	\N	\N	\N	\N	{"id": "cardano", "image": "https://coin-images.coingecko.com/coins/images/975/large/cardano.png?1696502090"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.793
56a4e8a8-310e-49af-bba1-fc3342ee0285	crypto	LEO	LEO Token	9.65	0.04	0.4299	561896	8894543515	\N	\N	\N	\N	{"id": "leo-token", "image": "https://coin-images.coingecko.com/coins/images/8418/large/leo-token.png?1696508607"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.799
71d8f306-8dfa-49b9-b550-378fef9f6722	crypto	XLM	Stellar	0.25	0.00	1.4070	175386366	8123802420	\N	\N	\N	\N	{"id": "stellar", "image": "https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg?1735231350"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.8
6ffa4dcd-a54a-4066-8848-0e794ef9132e	crypto	BSC-USD	Binance Bridged USDT (BNB Smart Chain)	1.00	0.00	-0.0575	1173383983	8980315266	\N	\N	\N	\N	{"id": "binance-bridged-usdt-bnb-smart-chain", "image": "https://coin-images.coingecko.com/coins/images/35021/large/USDT.png?1707233575"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.798
34b6cf36-d49a-4825-a659-35ef803c9d2d	crypto	BCH	Bitcoin Cash	533.26	13.75	2.5777	284492179	10625021702	\N	\N	\N	\N	{"id": "bitcoin-cash", "image": "https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png?1696501932"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.795
a7f1a9e4-cdd9-4ebb-b95b-38e272defcab	crypto	USDS	USDS	1.00	0.00	-0.0086	4146233	9301360437	\N	\N	\N	\N	{"id": "usds", "image": "https://coin-images.coingecko.com/coins/images/39926/large/usds.webp?1726666683"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.797
5a2d42ed-f67e-4441-8526-06d5bcd07fca	crypto	WETH	WETH	2902.22	15.80	0.5443	50453127	7827103170	\N	\N	\N	\N	{"id": "weth", "image": "https://coin-images.coingecko.com/coins/images/2518/large/weth.png?1696503332"}	2025-11-26 12:58:07.938564	2025-11-26 13:58:04.8
\.


--
-- Data for Name: portfolio_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.portfolio_items (id, user_id, symbol, name, asset_type, quantity, average_price, current_price, total_value, profit_loss, profit_loss_percent, created_at, updated_at) FROM stdin;
1eaf83f8-ee2d-4cd3-a464-84b425f38391	707d3fe9-aa92-4a63-a5c1-f366c83eb993	MSFT	Microsoft Corp	crypto	0.50000000	16356.93	16356.93	8178.47	0.00	0.0000	2025-11-14 17:12:49.387825	2025-11-14 17:46:51.79492
aaa6cd62-55c6-4131-8f05-98ebfaacaf50	7827cb33-45aa-48f2-bd2b-f06b28632e03	META	Meta Platforms Inc	crypto	3.57567000	20677.15	20677.15	73934.66	0.00	0.0000	2025-11-26 10:54:47.215483	2025-11-26 11:07:14.323592
72ea6101-2cc7-4dab-9844-0e27fa880384	7827cb33-45aa-48f2-bd2b-f06b28632e03	BNB	BNB	crypto	0.45000000	27921.73	27921.73	12564.78	0.00	0.0000	2025-11-26 11:07:14.323592	2025-11-26 11:07:14.323592
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transactions (id, user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount, created_at) FROM stdin;
2e8a3539-1724-41f9-b2da-366547e190d9	7827cb33-45aa-48f2-bd2b-f06b28632e03	buy	AAPL	Apple Inc	crypto	1.00000000	8870.88	8870.88	22.18	8893.05	2025-11-14 16:25:30.758309
d79e08b8-82d5-485f-98d3-ddef44265676	707d3fe9-aa92-4a63-a5c1-f366c83eb993	buy	MSFT	Microsoft Corp	crypto	1.00000000	16356.93	16356.93	40.89	16397.82	2025-11-14 17:12:49.387825
7e8de418-14dc-4579-a29a-fe4cfe92267c	707d3fe9-aa92-4a63-a5c1-f366c83eb993	sell	MSFT	Microsoft Corp	crypto	0.50000000	16356.93	8178.47	20.45	8158.02	2025-11-14 17:46:51.79492
b89af9c7-d3b5-4ff8-8b7d-d64c59945166	7827cb33-45aa-48f2-bd2b-f06b28632e03	buy	AAPL	Apple Inc	crypto	1.20000000	8792.22	10550.67	26.38	10577.05	2025-11-14 17:50:18.142324
c9aa6577-ebb6-490b-8b08-c362f3a02abc	7827cb33-45aa-48f2-bd2b-f06b28632e03	sell	AAPL	Apple Inc	crypto	0.80000000	8792.22	7033.78	17.58	7016.19	2025-11-14 17:52:01.909706
fc24d5a9-7707-45ca-9bac-f09b629068f3	7827cb33-45aa-48f2-bd2b-f06b28632e03	sell	AAPL	Apple Inc	crypto	1.40000000	8792.22	12309.11	30.77	12278.34	2025-11-14 17:52:46.208903
97e46f82-25f4-499b-b8f9-88d7dd7593d5	7827cb33-45aa-48f2-bd2b-f06b28632e03	buy	META	Meta Platforms Inc	crypto	3.57567000	20677.15	73934.66	184.84	74119.50	2025-11-26 10:54:47.215483
b2336f06-557d-43bb-ade2-70f6a91f1745	7827cb33-45aa-48f2-bd2b-f06b28632e03	buy	BNB	BNB	crypto	0.45000000	27921.73	12564.78	31.41	12596.19	2025-11-26 11:07:14.323592
\.


--
-- Data for Name: user_badges; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_badges (id, user_id, badge_id, earned_at) FROM stdin;
d6926582-a68c-4baf-a0eb-135ccdd85429	7827cb33-45aa-48f2-bd2b-f06b28632e03	ecdb888c-af22-4495-b6dd-4ed9ef836594	2025-11-14 16:25:30.827696
85509364-b957-4e17-a101-36e220156564	707d3fe9-aa92-4a63-a5c1-f366c83eb993	ecdb888c-af22-4495-b6dd-4ed9ef836594	2025-11-14 17:12:49.467466
73be1936-fc8a-4652-9a1a-f5deae6bd1c8	7827cb33-45aa-48f2-bd2b-f06b28632e03	050b3bd1-81aa-4954-8bc9-6477569d6de8	2025-11-26 10:54:47.307077
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, email, password_hash, email_verified, verification_code, verification_code_expires_at, balance, portfolio_value, total_profit_loss, rank, created_at, updated_at, last_login, is_admin, is_banned) FROM stdin;
707d3fe9-aa92-4a63-a5c1-f366c83eb993	hburaka	burak.altinkaya@hospitadent.com	$2a$10$wYiYpsuPifJIljq6udxYQ.dDiWuGZFN4fS/q8hBpzBAD7N641rOoq	t	\N	\N	91760.20	8178.47	0.00	1	2025-11-14 17:03:31.52661	2025-11-26 11:38:57.293196	2025-11-26 11:01:13.012893	f	f
7827cb33-45aa-48f2-bd2b-f06b28632e03	yasin	yasingulsoy02@gmail.com	$2a$10$gEZuRATSGpFF.MsLKbmOxO4ta2pts89ZAw7P/1yMrLDgY9gz8zRH.	t	\N	\N	13108.74	86499.44	0.00	2	2025-11-14 15:47:42.995427	2025-11-26 11:38:57.294268	2025-11-26 11:38:53.599089	t	f
\.


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: badges badges_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_name_key UNIQUE (name);


--
-- Name: badges badges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_pkey PRIMARY KEY (id);


--
-- Name: competition_participants competition_participants_competition_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competition_participants
    ADD CONSTRAINT competition_participants_competition_id_user_id_key UNIQUE (competition_id, user_id);


--
-- Name: competition_participants competition_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competition_participants
    ADD CONSTRAINT competition_participants_pkey PRIMARY KEY (id);


--
-- Name: competitions competitions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competitions
    ADD CONSTRAINT competitions_pkey PRIMARY KEY (id);


--
-- Name: email_verifications email_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_verifications
    ADD CONSTRAINT email_verifications_pkey PRIMARY KEY (id);


--
-- Name: market_data_cache market_data_cache_asset_type_symbol_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.market_data_cache
    ADD CONSTRAINT market_data_cache_asset_type_symbol_key UNIQUE (asset_type, symbol);


--
-- Name: market_data_cache market_data_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.market_data_cache
    ADD CONSTRAINT market_data_cache_pkey PRIMARY KEY (id);


--
-- Name: portfolio_items portfolio_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portfolio_items
    ADD CONSTRAINT portfolio_items_pkey PRIMARY KEY (id);


--
-- Name: portfolio_items portfolio_items_user_id_symbol_asset_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portfolio_items
    ADD CONSTRAINT portfolio_items_user_id_symbol_asset_type_key UNIQUE (user_id, symbol, asset_type);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: user_badges user_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);


--
-- Name: user_badges user_badges_user_id_badge_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_id_badge_id_key UNIQUE (user_id, badge_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_activity_logs_activity_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_activity_type ON public.activity_logs USING btree (activity_type);


--
-- Name: idx_activity_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_created_at ON public.activity_logs USING btree (created_at DESC);


--
-- Name: idx_activity_logs_user_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_user_created ON public.activity_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_activity_logs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_user_id ON public.activity_logs USING btree (user_id);


--
-- Name: idx_competition_participants_competition_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_competition_participants_competition_id ON public.competition_participants USING btree (competition_id);


--
-- Name: idx_competition_participants_rank; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_competition_participants_rank ON public.competition_participants USING btree (competition_id, rank);


--
-- Name: idx_competition_participants_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_competition_participants_user_id ON public.competition_participants USING btree (user_id);


--
-- Name: idx_email_verifications_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_email_verifications_code ON public.email_verifications USING btree (verification_code);


--
-- Name: idx_email_verifications_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_email_verifications_email ON public.email_verifications USING btree (email);


--
-- Name: idx_email_verifications_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_email_verifications_user_id ON public.email_verifications USING btree (user_id);


--
-- Name: idx_market_cache_asset_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_market_cache_asset_type ON public.market_data_cache USING btree (asset_type);


--
-- Name: idx_market_cache_cached_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_market_cache_cached_at ON public.market_data_cache USING btree (cached_at DESC);


--
-- Name: idx_market_cache_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_market_cache_expires_at ON public.market_data_cache USING btree (expires_at);


--
-- Name: idx_market_cache_symbol; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_market_cache_symbol ON public.market_data_cache USING btree (symbol);


--
-- Name: idx_portfolio_items_asset_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_portfolio_items_asset_type ON public.portfolio_items USING btree (asset_type);


--
-- Name: idx_portfolio_items_symbol; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_portfolio_items_symbol ON public.portfolio_items USING btree (symbol);


--
-- Name: idx_portfolio_items_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_portfolio_items_user_id ON public.portfolio_items USING btree (user_id);


--
-- Name: idx_transactions_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_created_at ON public.transactions USING btree (created_at DESC);


--
-- Name: idx_transactions_symbol; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_symbol ON public.transactions USING btree (symbol);


--
-- Name: idx_transactions_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_type ON public.transactions USING btree (type);


--
-- Name: idx_transactions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_user_id ON public.transactions USING btree (user_id);


--
-- Name: idx_user_badges_badge_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_badges_badge_id ON public.user_badges USING btree (badge_id);


--
-- Name: idx_user_badges_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_badges_user_id ON public.user_badges USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_rank; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_rank ON public.users USING btree (rank DESC);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: portfolio_items update_portfolio_items_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_portfolio_items_updated_at BEFORE UPDATE ON public.portfolio_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: activity_logs activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: competition_participants competition_participants_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competition_participants
    ADD CONSTRAINT competition_participants_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE CASCADE;


--
-- Name: competition_participants competition_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competition_participants
    ADD CONSTRAINT competition_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: email_verifications email_verifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_verifications
    ADD CONSTRAINT email_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: portfolio_items portfolio_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portfolio_items
    ADD CONSTRAINT portfolio_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_badges user_badges_badge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.badges(id) ON DELETE CASCADE;


--
-- Name: user_badges user_badges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 2G92Rp319zJZJ4JX06P4CAqmaCXBuJjDBdMWd7FMZlpxqOuMDVBK9Weuzr69Ndm

