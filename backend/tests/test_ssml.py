from app.ssml import MAX_REQUEST_BYTES, Pronunciation, build_ssml, lexicon_hash

LEX = [Pronunciation("Michalská brána", "ipa", "ˈmixalskaː ˈbraːna"), Pronunciation("Michalská", "ipa", "ˈmixalskaː")]


def test_longest_lexicon_match_wins_and_text_is_escaped():
    build = build_ssml("Stand under Michalská brána & look up.\n\nMichalská street <starts> here.", "en-US", LEX)
    (chunk,) = build.chunks
    assert '<phoneme alphabet="ipa" ph="ˈmixalskaː ˈbraːna">Michalská brána</phoneme>' in chunk
    assert '<phoneme alphabet="ipa" ph="ˈmixalskaː">Michalská</phoneme> street' in chunk
    assert "&amp; look up" in chunk and "&lt;starts&gt;" in chunk
    assert chunk.startswith("<speak><p>") and chunk.endswith("</p></speak>")


def test_chunks_respect_the_byte_limit_not_the_character_limit():
    # 2-byte characters: 4,000 characters would pass a character check and fail the API.
    paragraph = ("Žltý kôň úpel ďaleko. " * 40).strip()
    build = build_ssml("\n\n".join([paragraph] * 12), "sk-SK", [])
    assert len(build.chunks) > 1
    assert all(len(c.encode("utf-8")) <= MAX_REQUEST_BYTES for c in build.chunks)
    assert all(c.startswith("<speak>") and c.endswith("</speak>") for c in build.chunks)


def test_an_oversized_paragraph_is_split_at_sentences():
    paragraph = " ".join(f"Sentence number {i} is about the old town walls and their gates." for i in range(200))
    build = build_ssml(paragraph, "en-US", [])
    assert len(build.chunks) > 1
    assert all(len(c.encode("utf-8")) <= MAX_REQUEST_BYTES for c in build.chunks)


def test_billed_characters_include_the_tags():
    build = build_ssml("Michalská brána.", "en-US", LEX)
    assert build.billed_chars == len(build.chunks[0]) > len("Michalská brána.")


def test_lexicon_hash_depends_only_on_entries_used():
    text = "Michalská brána is a gate."
    unused = Pronunciation("Hlavné námestie", "ipa", "ˈɦlaʋneː ˈnaːmestje")
    assert build_ssml(text, "en-US", LEX).lexicon_hash == build_ssml(text, "en-US", LEX + [unused]).lexicon_hash
    changed = [Pronunciation("Michalská brána", "ipa", "ˈmixalska ˈbraːna")]
    assert build_ssml(text, "en-US", LEX).lexicon_hash != build_ssml(text, "en-US", changed).lexicon_hash
    assert lexicon_hash("en-US", []) != lexicon_hash("de-DE", [])
