-- Kokoro-82M on DeepInfra, at https://deepinfra.com/hexgrad/Kokoro-82M/api (checked 2026-10-14).
-- Billed per input character. The backend uses the default tier; "priority" is 1.5x.

INSERT INTO model_prices (provider, model, tier, unit_type, usd_per_million, effective_from, effective_to, source_url)
VALUES ('deepinfra', 'hexgrad/Kokoro-82M', 'standard', 'character', 0.99, '2026-10-01', NULL,
        'https://deepinfra.com/hexgrad/Kokoro-82M/api');
