-- Reword the AI-tools feature bullet to the owner-approved phrasing
-- (slashes keep the comma-separated list splittable).

UPDATE plans
SET features = '1 user, Connect with any AI tool like Claude / ChatGPT / Gemini and more, Multi-Trades™ MCP Server Access, 3 AI Advisors, Standard support'
WHERE id = 'starter';

UPDATE plans
SET features = 'Unlimited users, Connect with any AI tool like Claude / ChatGPT / Gemini and more, Multi-Trades™ MCP Server Access, 7 AI Advisors, Priority support, Scheduled briefings (Morning/Weekly/Monthly)'
WHERE id = 'pro';
