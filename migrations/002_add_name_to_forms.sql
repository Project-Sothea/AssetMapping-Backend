-- Migration: add `name` column to forms table
-- Add a nullable text column `name` to store form title/name
ALTER TABLE IF EXISTS public.forms
ADD COLUMN IF NOT EXISTS name TEXT;
