-- Gemini 3.8 Flash TTS, verified 2026-10-02 at https://ai.google.dev/gemini-api/docs/pricing
-- Text in, audio out, billed per token (audio is about 25 tokens per second).
-- Promotional until 2026-12-31, doubling on 2027-01-01, like the 3.x Flash text models.

INSERT INTO model_prices (provider, model, tier, unit_type, usd_per_million, effective_from, effective_to, source_url)
SELECT 'google-gemini', 'gemini-3.8-flash-tts', p.tier, p.unit_type, p.price, p.eff_from::date, p.eff_to::date,
       'https://ai.google.dev/gemini-api/docs/pricing'
FROM (VALUES
    ('standard', 'input_token',  0.50, '2026-10-01', '2027-01-01'),
    ('standard', 'output_token', 9.00, '2026-10-01', '2027-01-01'),
    ('batch',    'input_token',  0.25, '2026-10-01', '2027-01-01'),
    ('batch',    'output_token', 4.50, '2026-10-01', '2027-01-01'),
    ('standard', 'input_token',  1.00, '2027-01-01', NULL),
    ('standard', 'output_token', 18.00, '2027-01-01', NULL),
    ('batch',    'input_token',  0.50, '2027-01-01', NULL),
    ('batch',    'output_token', 9.00, '2027-01-01', NULL)
) AS p (tier, unit_type, price, eff_from, eff_to);
