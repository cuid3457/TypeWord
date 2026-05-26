// 사전 클라이언트 공통 타입.
// dict-first 파이프라인에서 사전마다 다른 응답 구조를 통일된 형식으로 변환한 결과.

export type DictSourceLang = "ko" | "ja" | "zh-CN" | "en" | "es" | "fr" | "de" | "it";

export interface DictSense {
  /** 사전 sense 고유 ID (예: krdict target_code:sense_order, jmdict seq:idx). */
  sense_id: string;
  /** 원어 정의문 (AI 컨텍스트용 — 사용자에 직접 노출하지 않음). */
  source_def: string;
  /** 사전이 제공하는 영어 번역. 음역(transliteration only)인 경우 추후 AI judge가 보강. */
  en_translation?: string;
  /** 사전이 제공하는 추가 target_lang 번역들 (krdict는 11개 언어, JMdict는 dut/eng/fre/ger/...). */
  translations_by_lang?: Record<string, string>;
  /** 사전 메타: 품사, register 태그 등. AI judge prompt에 활용. */
  pos?: string;
  grade?: string; // krdict word_grade ("초급" / "중급" / "고급")
  misc_tags?: string[]; // JMdict misc (arch/obs/col/vulg etc.)
  /** 동음이의 인덱스 (krdict sup_no, jmdict seq별 entry 묶음). */
  homograph_index?: string;
  /** Dictionary-provided example sentences (when the source dict ships them). */
  examples?: Array<{ text: string; translation?: string }>;
}

export interface DictEntry {
  /** 표제어 그대로. */
  headword: string;
  /** 발음 (krdict pronunciation, jmdict kana, cedict pinyin, freedict IPA). */
  reading?: string;
  /** 이 entry의 의미들. */
  senses: DictSense[];
  /** 사전 출처 (UI 노출용 attribution). */
  source: "krdict" | "jmdict" | "cedict" | "freedict";
}

export interface DictExample {
  /** 원어 예문. */
  text: string;
  /** 번역 (있을 경우). */
  translation?: string;
}
