// Configured Supabase client for browser pages. Loaded as an ES module,
// e.g. <script type="module" src="/js/supabaseClient.js"></script>, or
// imported by another module with `import { supabase } from "./supabaseClient.js"`.
//
// The anon key is safe to ship to the browser — Row Level Security on
// every table is what actually protects the data (see
// supabase/migrations/0001_init_schema.sql). Never put the service-role
// key here or in any file under js/ — it belongs only in Vercel's
// server-side environment variables, used by files under api/.
//
// TODO: replace both placeholders once the Supabase project exists
// (see the "Deployment / migration order" section of the backend plan).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

var SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
var SUPABASE_ANON_KEY = "YOUR-ANON-KEY";

export var supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
