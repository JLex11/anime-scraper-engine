import { createClient } from '@supabase/supabase-js'
import type { AppConfig } from '../config'

export const createSupabaseClient = (appConfig: AppConfig) => {
	return createClient(appConfig.supabaseUrl, appConfig.supabaseServiceRoleKey, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
		},
	})
}
