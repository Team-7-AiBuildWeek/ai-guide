-- Gemini 2.5 Flash Preview TTS, the live narration's voice, at https://ai.google.dev/gemini-api/docs/pricing
-- Standard tier only: this model has no Batch API. Text in, audio out (~25 audio tokens a second).

INSERT INTO model_prices (provider, model, tier, unit_type, usd_per_million, effective_from, effective_to, source_url)
SELECT 'google-gemini', 'gemini-2.5-flash-preview-tts', p.tier, p.unit_type, p.price, p.eff_from::date, NULL,
       'https://ai.google.dev/gemini-api/docs/pricing'
FROM (VALUES
    ('standard', 'input_token',   0.50, '2026-10-01'),
    ('standard', 'output_token', 10.00, '2026-10-01')
) AS p (tier, unit_type, price, eff_from);
