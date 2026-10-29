import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://xnsloxblgoraknxqkynn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-r7HRQW8AdQLw-4QnUfsHQ_sLDgj1eH";

export const supabase = createClient(
SUPABASE_URL,
SUPABASE_PUBLISHABLE_KEY
);
