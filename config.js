// Public settings shared by the app and the booking page. The anon key is designed to be public:
// row-level security in the database decides what it can read or write (see supabase/migrations).
// Project "luster" (us-east-1). The legacy anon key is used because supabase-js 2.45 expects a JWT here.
window.LUSTER_CONFIG = {
  supabaseUrl: 'https://rndipfzcdirenvarddws.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZGlwZnpjZGlyZW52YXJkZHdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5ODE0MDAsImV4cCI6MjEwODU1NzQwMH0.8tfEct8NYSjx3h9QZp4vwGUBjAgTm8jASnws3InmiKc',
};
