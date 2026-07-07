@echo off
REM Replace the values below with your real Supabase Project URL and service_role key.
REM Do not share your service_role key.
set SUPABASE_URL=https://your-project-id.supabase.co
set SUPABASE_SERVICE_KEY=your-service-role-key-here

REM Use this only if company network/proxy causes CERTIFICATE_VERIFY_FAILED.
set SLIC_SSL_VERIFY=false

python local_sync_agent.py
pause
