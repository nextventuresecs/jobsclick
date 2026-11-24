-- Migration: 20261110000007_reset_views_security_invoker.sql
-- Description: Reset security_invoker on public discovery views so they execute under view owner (postgres) context.

ALTER VIEW public.public_business_profiles RESET (security_invoker);
ALTER VIEW public.public_institution_profiles RESET (security_invoker);
ALTER VIEW public.public_jobs RESET (security_invoker);
