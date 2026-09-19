// Configured Supabase client for browser pages. Loaded as an ES module,
// e.g. <script type="module" src="/js/supabaseClient.js"></script>, or
// imported by another module with `import { supabase } from "./supabaseClient.js"`.
//
// The publishable key is safe to ship to the browser — Row Level
// Security on every table is what actually protects the data (see
// supabase/migrations/0001_init_schema.sql). It's treated the same as
// the legacy "anon key" for RLS purposes, just independently revocable
// without rotating the whole project JWT secret. Never put the secret
// key here or in any file under js/ — it belongs only in Vercel's
// server-side environment variables, used by files under api/.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

var SUPABASE_URL = "https://dxkbnqceyuffhpfwgvxn.supabase.co";
var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_dnkCwiSLeSO9VUSFfAvREw_zgvZ2-rj";

export var supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
