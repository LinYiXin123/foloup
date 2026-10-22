-- The app now reads and writes only through the server with the service-role key,
-- which bypasses row-level security. Enabling RLS with no policies means the public
-- anon key (which used to be shipped to every browser) can no longer read or change anything.
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviewer ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview ENABLE ROW LEVEL SECURITY;
ALTER TABLE response ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
