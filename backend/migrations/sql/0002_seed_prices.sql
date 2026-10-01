-- Prices verified 2026-10-01 against:
--   https://ai.google.dev/gemini-api/docs/pricing
--   https://cloud.google.com/text-to-speech/pricing
-- Gemini 3.x Flash prices are promotional until 2026-12-31 and double on 2027-01-01.
-- Chirp 3: HD's 1M free characters per month are not modelled: the ledger records list
-- price, which overstates spend inside the free tier rather than understating it.

INSERT INTO model_prices (provider, model, tier, unit_type, usd_per_million, effective_from, effective_to, source_url)
SELECT 'google-gemini', m.model, p.tier, p.unit_type, p.price, p.eff_from::date, p.eff_to::date,
       'https://ai.google.dev/gemini-api/docs/pricing'
FROM (VALUES ('gemini-3.8-flash'), ('gemini-3.6-flash')) AS m (model)
CROSS JOIN (VALUES
    ('standard', 'input_token',         0.75,   '2026-10-01', '2027-01-01'),
    ('standard', 'output_token',        3.75,   '2026-10-01', '2027-01-01'),
    ('standard', 'cached_input_token',  0.075,  '2026-10-01', '2027-01-01'),
    ('batch',    'input_token',         0.375,  '2026-10-01', '2027-01-01'),
    ('batch',    'output_token',        1.875,  '2026-10-01', '2027-01-01'),
    ('batch',    'cached_input_token',  0.0375, '2026-10-01', '2027-01-01'),
    ('standard', 'input_token',         1.50,   '2027-01-01', NULL),
    ('standard', 'output_token',        7.50,   '2027-01-01', NULL),
    ('standard', 'cached_input_token',  0.15,   '2027-01-01', NULL),
    ('batch',    'input_token',         0.75,   '2027-01-01', NULL),
    ('batch',    'output_token',        3.75,   '2027-01-01', NULL),
    ('batch',    'cached_input_token',  0.075,  '2027-01-01', NULL)
) AS p (tier, unit_type, price, eff_from, eff_to);

INSERT INTO model_prices (provider, model, tier, unit_type, usd_per_million, effective_from, effective_to, source_url) VALUES
    ('google-gemini', 'gemini-3.5-flash-lite', 'standard', 'input_token',        0.30, '2026-10-01', NULL, 'https://ai.google.dev/gemini-api/docs/pricing'),
    ('google-gemini', 'gemini-3.5-flash-lite', 'standard', 'output_token',       2.50, '2026-10-01', NULL, 'https://ai.google.dev/gemini-api/docs/pricing'),
    ('google-gemini', 'gemini-3.5-flash-lite', 'standard', 'cached_input_token', 0.03, '2026-10-01', NULL, 'https://ai.google.dev/gemini-api/docs/pricing'),
    ('google-gemini', 'gemini-3.5-flash-lite', 'batch',    'input_token',        0.15, '2026-10-01', NULL, 'https://ai.google.dev/gemini-api/docs/pricing'),
    ('google-gemini', 'gemini-3.5-flash-lite', 'batch',    'output_token',       1.25, '2026-10-01', NULL, 'https://ai.google.dev/gemini-api/docs/pricing'),
    ('google-gemini', 'gemini-3.5-flash-lite', 'batch',    'cached_input_token', 0.02, '2026-10-01', NULL, 'https://ai.google.dev/gemini-api/docs/pricing'),
    ('google-cloud-tts', 'chirp3-hd', 'standard', 'character', 30.00, '2026-10-01', NULL, 'https://cloud.google.com/text-to-speech/pricing');
