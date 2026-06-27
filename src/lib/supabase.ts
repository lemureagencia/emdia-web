import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vwlscymvrtmkuejtkies.supabase.co';
const supabaseKey = 'sb_publishable_Xep6roK5K9Zpo_GGhQ9xFw_9VPxxu8P';

export const supabase = createClient(supabaseUrl, supabaseKey);
