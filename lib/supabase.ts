import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type ActiveSession = {
  id: string
  room_code: string
  cctv_connected: boolean
  monitor_connected: boolean
  blue_threshold: number
  current_blue_level: number
  updated_at: string
}