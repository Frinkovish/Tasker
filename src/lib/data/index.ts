import type { WorkRepository } from "./repository";
import { supabaseRepository } from "./supabase-repository";

export const repository: WorkRepository = supabaseRepository;
