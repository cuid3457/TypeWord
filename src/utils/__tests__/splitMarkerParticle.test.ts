import { splitMarkerParticle } from '../splitMarkerParticle';

describe('splitMarkerParticle', () => {
  describe('Korean', () => {
    it('splits noun + 은', () => {
      const r = splitMarkerParticle('책은', '책', 'ko', 'noun');
      expect(r).toEqual({ head: '책', tail: '은' });
    });

    it('splits noun + 에서 (longest match wins over 에)', () => {
      const r = splitMarkerParticle('의자에서', '의자', 'ko', 'noun');
      expect(r).toEqual({ head: '의자', tail: '에서' });
    });

    it('splits 3-char particle 이라도', () => {
      const r = splitMarkerParticle('잠시이라도', '잠시', 'ko', 'noun');
      expect(r).toEqual({ head: '잠시', tail: '이라도' });
    });

    it('does not split verb forms (POS gate)', () => {
      const r = splitMarkerParticle('먹었다', '먹다', 'ko', 'verb');
      expect(r).toEqual({ head: '먹었다', tail: '' });
    });

    it('does not split adjective forms', () => {
      const r = splitMarkerParticle('예뻤네', '예쁘다', 'ko', 'adjective');
      expect(r).toEqual({ head: '예뻤네', tail: '' });
    });

    it('preserves "가나" (no headword anchor match → no split)', () => {
      // Word "가" + particle "나" would be wrong — "가나" is a noun
      // (Ghana). Headword anchor ensures we only split when the marker
      // begins with the actual headword.
      const r = splitMarkerParticle('가나', '가나', 'ko', 'noun');
      expect(r).toEqual({ head: '가나', tail: '' });
    });

    it('handles when marker does not start with headword', () => {
      // Inflected form / different word → leave alone.
      const r = splitMarkerParticle('다른책', '책', 'ko', 'noun');
      expect(r).toEqual({ head: '다른책', tail: '' });
    });

    it('accepts Korean POS string 명사', () => {
      const r = splitMarkerParticle('책을', '책', 'ko', '명사');
      expect(r).toEqual({ head: '책', tail: '을' });
    });

    it('no split when POS missing', () => {
      const r = splitMarkerParticle('책은', '책', 'ko');
      expect(r).toEqual({ head: '책은', tail: '' });
    });
  });

  describe('Japanese', () => {
    it('splits noun + は', () => {
      const r = splitMarkerParticle('学校は', '学校', 'ja', 'noun');
      expect(r).toEqual({ head: '学校', tail: 'は' });
    });

    it('splits noun + から (longest match)', () => {
      const r = splitMarkerParticle('家から', '家', 'ja', 'noun');
      expect(r).toEqual({ head: '家', tail: 'から' });
    });

    it('does not split verb-final な (POS gate)', () => {
      const r = splitMarkerParticle('好きな', '好き', 'ja', 'adjective');
      expect(r).toEqual({ head: '好きな', tail: '' });
    });

    it('does not split conjugated verb', () => {
      const r = splitMarkerParticle('食べた', '食べる', 'ja', 'verb');
      expect(r).toEqual({ head: '食べた', tail: '' });
    });

    it('accepts JP POS string 名詞', () => {
      const r = splitMarkerParticle('本を', '本', 'ja', '名詞');
      expect(r).toEqual({ head: '本', tail: 'を' });
    });
  });

  describe('Chinese', () => {
    it('splits noun + 的 (no POS gate)', () => {
      const r = splitMarkerParticle('好的', '好', 'zh-CN', 'adjective');
      expect(r).toEqual({ head: '好', tail: '的' });
    });

    it('splits verb + 了 (POS gate disabled for zh)', () => {
      const r = splitMarkerParticle('吃了', '吃', 'zh-CN', 'verb');
      expect(r).toEqual({ head: '吃', tail: '了' });
    });

    it('splits verb + 着', () => {
      const r = splitMarkerParticle('看着', '看', 'zh-CN', 'verb');
      expect(r).toEqual({ head: '看', tail: '着' });
    });

    it('handles zh-TW lang code', () => {
      const r = splitMarkerParticle('來了', '來', 'zh-TW', 'verb');
      expect(r).toEqual({ head: '來', tail: '了' });
    });
  });

  describe('unsupported languages', () => {
    it('English: no-op', () => {
      const r = splitMarkerParticle('runs', 'run', 'en', 'verb');
      expect(r).toEqual({ head: 'runs', tail: '' });
    });

    it('French: no-op', () => {
      const r = splitMarkerParticle('chats', 'chat', 'fr', 'noun');
      expect(r).toEqual({ head: 'chats', tail: '' });
    });
  });

  describe('edge cases', () => {
    it('empty marker', () => {
      const r = splitMarkerParticle('', '책', 'ko', 'noun');
      expect(r).toEqual({ head: '', tail: '' });
    });

    it('empty headword', () => {
      const r = splitMarkerParticle('책은', '', 'ko', 'noun');
      expect(r).toEqual({ head: '책은', tail: '' });
    });

    it('marker equals headword (no particle)', () => {
      const r = splitMarkerParticle('책', '책', 'ko', 'noun');
      expect(r).toEqual({ head: '책', tail: '' });
    });

    it('unknown suffix (not in whitelist)', () => {
      const r = splitMarkerParticle('책상', '책', 'ko', 'noun');
      // "책상" is one word; "상" is not in the particle whitelist.
      expect(r).toEqual({ head: '책상', tail: '' });
    });

    it('partial match in middle is rejected', () => {
      // "은행" is bank; if headword were "은행" and we mistakenly thought
      // "행" is a particle, we'd over-split. The exact-suffix rule prevents
      // chained-particle false positives too.
      const r = splitMarkerParticle('은행은', '은행', 'ko', 'noun');
      expect(r).toEqual({ head: '은행', tail: '은' });
    });
  });
});
