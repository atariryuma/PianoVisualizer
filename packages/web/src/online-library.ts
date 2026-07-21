// Online library — MuseTrainer GitHub catalog — Phase 0d batch 52.
//
// Wraps the GitHub raw-list endpoint (pinned to a specific commit SHA
// so an upstream library update can't push un-reviewed content into a
// kids app — App Store 4.7 / 5.2.3 compliance, effective 2025-11-13).
//
// Surface:
//   - LIBRARY_PINNED_SHA / LIBRARY_API_URL / LIBRARY_CACHE_KEY /
//     LIBRARY_CACHE_TTL_MS / LIBRARY_JP / LIBRARY_SEED — exported
//     constants. The pinned SHA + bilingual override table are part
//     of the catalog contract, not implementation detail.
//   - createOnlineLibrary(deps) → { entryFromGhFile, fetchEntries }.
//     fetchEntries reads from localStorage cache (1 h TTL) when not
//     forced; otherwise hits GitHub, sorts by label, writes the cache,
//     returns. All globals (fetch, localStorage, Date.now) flow
//     through deps so the test stubs cleanly.
//
// Bump LIBRARY_PINNED_SHA + LIBRARY_API_URL together when
// intentionally refreshing. The cache key version (v2) was bumped
// when JP-translation fields were added to the cached entry shape;
// bump again on any future shape change so existing v2 caches don't
// deny users new fields.

export const LIBRARY_PINNED_SHA = '9128876f6164d96997c877a2be843349a32bdabb';
export const LIBRARY_API_URL =
  'https://api.github.com/repos/musetrainer/library/contents/scores?ref=' +
  LIBRARY_PINNED_SHA +
  '&per_page=200';
/** v3: bumped when LIBRARY_EXCLUDE was added, so any existing cache
 *  that still contains a now-excluded (non-public-domain) file is
 *  discarded on first launch instead of waiting out the 1 h TTL.
 *  (v2 bumped after adding `filename` + JP translations to the cached
 *  entry shape.) */
export const LIBRARY_CACHE_KEY = 'pianoViz_libraryCache_v3';
export const LIBRARY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Filenames present in the pinned catalog that are NOT public domain and must
 * never be offered in-app. The upstream musetrainer/library repo labels its
 * whole catalog "public domain", but it ships no LICENSE file and this claim
 * is demonstrably wrong for these files, so we exclude them ourselves rather
 * than trust the upstream label — keeping the "honest, public-domain-only"
 * promise literally true.
 *
 * "Mariage d'Amour" (also circulated as a **mis-attributed** "Chopin — Spring
 * Waltz") was composed by **Paul de Senneville in 1978**. He is a living
 * composer, so the work is under copyright worldwide (death + 70) — Chopin
 * never wrote it. All three filenames below are the same copyrighted piece.
 */
export const LIBRARY_EXCLUDE: ReadonlySet<string> = new Set([
  'Mariage_dAmour.mxl',
  'Chopin_-_Spring_Waltz.mxl',
  'Spring_Waltz_Mariage_dAmour_-_Chopin.mxl',
]);

/** Curated Japanese labels for every score in the pinned MuseTrainer
 *  catalog (69 .mxl files at SHA 9128876…). Keyed by exact filename
 *  so a future pin bump only needs additions (no rebuilds). Falls
 *  back to the ASCII-derived label when a filename isn't in the
 *  table. */
export const LIBRARY_JP: Record<string, { titleJp: string; composerJp: string }> = {
  '12_Variations_of_Twinkle_Twinkle_Little_Star.mxl': {
    titleJp: 'キラキラ星変奏曲',
    composerJp: 'モーツァルト',
  },
  'Arabesque_L._66_No._1_in_E_Major.mxl': {
    titleJp: 'アラベスク 第1番',
    composerJp: 'ドビュッシー',
  },
  'Ave_Maria_D839_-_Schubert_-_Solo_Piano_Arrg..mxl': {
    titleJp: 'アヴェ・マリア D.839',
    composerJp: 'シューベルト',
  },
  'Bach_Minuet_in_G_Major_BWV_Anh._114.mxl': {
    titleJp: 'メヌエット ト長調 BWV Anh.114',
    composerJp: 'バッハ',
  },
  'Bach_Toccata_and_Fugue_in_D_Minor_Piano_solo.mxl': {
    titleJp: 'トッカータとフーガ ニ短調',
    composerJp: 'バッハ',
  },
  'Beethoven_Symphony_No._5_1st_movement_Piano_solo.mxl': {
    titleJp: '交響曲第5番「運命」第1楽章',
    composerJp: 'ベートーヴェン',
  },
  'Bella_Ciao.mxl': { titleJp: 'ベラ・チャオ', composerJp: 'イタリア民謡' },
  'Bella_Ciao_-_La_Casa_de_Papel.mxl': {
    titleJp: 'ベラ・チャオ (ペーパー・ハウス版)',
    composerJp: 'イタリア民謡',
  },
  'Canon_in_D.mxl': { titleJp: 'カノン ニ長調', composerJp: 'パッヘルベル' },
  'Canon_in_D_3.mxl': { titleJp: 'カノン ニ長調 (アレンジ)', composerJp: 'パッヘルベル' },
  'Canon_in_D_easy.mxl': { titleJp: 'カノン ニ長調 (やさしい)', composerJp: 'パッヘルベル' },
  'Carol_of_the_Bells.mxl': {
    titleJp: 'キャロル・オブ・ザ・ベルズ',
    composerJp: 'レオントーヴィチ',
  },
  'Carol_of_the_Bells_easy_piano.mxl': {
    titleJp: 'キャロル・オブ・ザ・ベルズ (やさしい)',
    composerJp: 'レオントーヴィチ',
  },
  'Chopin_-_Ballade_no._1_in_G_minor_Op._23.mxl': {
    titleJp: 'バラード第1番 ト短調 Op.23',
    composerJp: 'ショパン',
  },
  'Chopin_-_Nocturne_Op._9_No._1.mxl': { titleJp: 'ノクターン Op.9-1', composerJp: 'ショパン' },
  'Chopin_-_Nocturne_Op_9_No_2_E_Flat_Major.mxl': {
    titleJp: 'ノクターン Op.9-2 変ホ長調',
    composerJp: 'ショパン',
  },
  'Clair_de_Lune__Debussy.mxl': { titleJp: '月の光', composerJp: 'ドビュッシー' },
  'Clair_de_lune_-_Claude_Debussy.mxl': { titleJp: '月の光 (別編)', composerJp: 'ドビュッシー' },
  'DANSE_VILLAGEOISE_Beethoven.mxl': { titleJp: '田舎の踊り', composerJp: 'ベートーヴェン' },
  'Dance_of_the_sugar_plum_fairy.mxl': {
    titleJp: '金平糖の踊り',
    composerJp: 'チャイコフスキー',
  },
  'Erik_Satie_-_Gymnopedie_No.1.mxl': { titleJp: 'ジムノペディ 第1番', composerJp: 'サティ' },
  'Flight_of_the_Bumblebee.mxl': {
    titleJp: '熊蜂の飛行',
    composerJp: 'リムスキー=コルサコフ',
  },
  'Fur_Elise.mxl': { titleJp: 'エリーゼのために', composerJp: 'ベートーヴェン' },
  'Fur_Elise_-_Beethoven_-_for_beginner_piano.mxl': {
    titleJp: 'エリーゼのために (初心者用)',
    composerJp: 'ベートーヴェン',
  },
  'Fur_Elise_Easy_Piano.mxl': {
    titleJp: 'エリーゼのために (やさしい)',
    composerJp: 'ベートーヴェン',
  },
  'Fur_Elise_fingered.mxl': {
    titleJp: 'エリーゼのために (運指付き)',
    composerJp: 'ベートーヴェン',
  },
  'G_Minor_Bach.mxl': { titleJp: 'メヌエット ト短調 BWV Anh.115', composerJp: 'ペツォールト' },
  'G_Minor_Bach_Original.mxl': { titleJp: 'メヌエット ト短調 (原曲)', composerJp: 'ペツォールト' },
  'Gnossienne_No._1.mxl': { titleJp: 'グノシエンヌ 第1番', composerJp: 'サティ' },
  'Greensleeves_for_Piano_easy_and_beautiful.mxl': {
    titleJp: 'グリーンスリーブス',
    composerJp: 'イングランド民謡',
  },
  'Gymnopdie_No._1__Satie.mxl': {
    titleJp: 'ジムノペディ 第1番 (別編)',
    composerJp: 'サティ',
  },
  'Happy_Birthday_To_You_C_Major.mxl': {
    titleJp: 'ハッピーバースデー (ハ長調)',
    composerJp: 'ヒル姉妹',
  },
  'Happy_Birthday_To_You_Piano.mxl': { titleJp: 'ハッピーバースデー', composerJp: 'ヒル姉妹' },
  'Hungarian_Dance_No_5_in_G_Minor.mxl': {
    titleJp: 'ハンガリー舞曲 第5番',
    composerJp: 'ブラームス',
  },
  'Hungarian_Sonata.mxl': { titleJp: 'ハンガリー狂詩曲', composerJp: 'リスト' },
  'J._S._Bach_-_Air_on_the_G_String_Piano_arrangement.mxl': {
    titleJp: 'G線上のアリア',
    composerJp: 'バッハ',
  },
  'La_Campanella_-_Grandes_Etudes_de_Paganini_No._3_-_Franz_Liszt.mxl': {
    titleJp: 'ラ・カンパネラ',
    composerJp: 'リスト',
  },
  'Lacrimosa_-_Requiem.mxl': {
    titleJp: 'レクイエム より「ラクリモーサ」',
    composerJp: 'モーツァルト',
  },
  'Liebestraum_No._3_in_A_Major.mxl': { titleJp: '愛の夢 第3番', composerJp: 'リスト' },
  'Maple_Leaf_Rag_Scott_Joplin.mxl': {
    titleJp: 'メイプル・リーフ・ラグ',
    composerJp: 'ジョプリン',
  },
  'Minuet_in_G_Major_Bach.mxl': { titleJp: 'メヌエット ト長調', composerJp: 'バッハ' },
  'Mozart_-_Piano_Sonata_No._16_-_Allegro.mxl': {
    titleJp: 'ピアノソナタ第16番 第1楽章',
    composerJp: 'モーツァルト',
  },
  'Nocturne_No._20_in_C_Minor.mxl': {
    titleJp: 'ノクターン第20番 嬰ハ短調 (遺作)',
    composerJp: 'ショパン',
  },
  'Nocturne_in_C_sharp_Minor.mxl': {
    titleJp: 'ノクターン 嬰ハ短調 (遺作)',
    composerJp: 'ショパン',
  },
  'Nocturne_in_E-flat_Major_Op._9_No._2_Easy.mxl': {
    titleJp: 'ノクターン Op.9-2 (やさしい)',
    composerJp: 'ショパン',
  },
  'Ode_to_Joy_Easy_variation.mxl': {
    titleJp: '歓喜の歌 (やさしい)',
    composerJp: 'ベートーヴェン',
  },
  'Passacaglia.mxl': { titleJp: 'パッサカリア', composerJp: 'ヘンデル / ハルヴォルセン' },
  'Passacaglia2.mxl': {
    titleJp: 'パッサカリア (アレンジ2)',
    composerJp: 'ヘンデル / ハルヴォルセン',
  },
  'Piano_Sonata_No._11_K._331_3rd_Movement_Rondo_alla_Turca.mxl': {
    titleJp: 'トルコ行進曲 (ピアノソナタ第11番第3楽章)',
    composerJp: 'モーツァルト',
  },
  'Prelude_I_in_C_major_BWV_846_-_Well_Tempered_Clavier_First_Book.mxl': {
    titleJp: '前奏曲 第1番 ハ長調 BWV 846',
    composerJp: 'バッハ',
  },
  'Prelude_No._2_BWV_847_in_C_Minor.mxl': {
    titleJp: '前奏曲 第2番 ハ短調 BWV 847',
    composerJp: 'バッハ',
  },
  'Prlude_No._4_in_E_Minor_Op._28_-_Frdric_Chopin.mxl': {
    titleJp: '前奏曲 第4番 ホ短調 Op.28',
    composerJp: 'ショパン',
  },
  'Prlude_Opus_28_No._4_in_E_Minor__Chopin.mxl': {
    titleJp: '前奏曲 Op.28-4 ホ短調',
    composerJp: 'ショパン',
  },
  'Schubert_Serenade_-_Standchen_-_By_Lizst.mxl': {
    titleJp: 'セレナーデ (リスト編)',
    composerJp: 'シューベルト',
  },
  'Sonata_No._16_1st_Movement_K._545.mxl': {
    titleJp: 'ピアノソナタ第16番 K.545 第1楽章',
    composerJp: 'モーツァルト',
  },
  'Sonate_No._14_Moonlight_1st_Movement.mxl': {
    titleJp: '月光ソナタ 第1楽章',
    composerJp: 'ベートーヴェン',
  },
  'Sonate_No._14_Moonlight_3rd_Movement.mxl': {
    titleJp: '月光ソナタ 第3楽章',
    composerJp: 'ベートーヴェン',
  },
  'Sonate_No._8_Pathetique_2nd_Movement.mxl': {
    titleJp: '悲愴ソナタ 第2楽章',
    composerJp: 'ベートーヴェン',
  },
  'Swan_Lake.mxl': { titleJp: '白鳥の湖', composerJp: 'チャイコフスキー' },
  'The_Entertainer_-_Scott_Joplin.mxl': {
    titleJp: 'ジ・エンターテイナー',
    composerJp: 'ジョプリン',
  },
  'The_Entertainer_-_Scott_Joplin_-_1902.mxl': {
    titleJp: 'ジ・エンターテイナー (1902)',
    composerJp: 'ジョプリン',
  },
  'WA_Mozart_Marche_Turque_Turkish_March_fingered.mxl': {
    titleJp: 'トルコ行進曲 (運指付き)',
    composerJp: 'モーツァルト',
  },
  'Waltz_Opus_64_No._2_in_C_Minor.mxl': {
    titleJp: 'ワルツ Op.64-2 嬰ハ短調',
    composerJp: 'ショパン',
  },
  'Waltz_in_A_MinorChopin.mxl': { titleJp: 'ワルツ イ短調 (遺作)', composerJp: 'ショパン' },
  'Waltz_of_the_Flowers.mxl': {
    titleJp: '花のワルツ',
    composerJp: 'チャイコフスキー',
  },
  'moonlight_sonata_3rd_movement.mxl': {
    titleJp: '月光ソナタ 第3楽章',
    composerJp: 'ベートーヴェン',
  },
};

/** Library entry shape — narrow enough that we don't need to import
 *  @piano/core at type-level here. */
export interface LibraryEntry {
  url: string;
  label: string;
  icon: string;
  filename?: string;
  composer?: string;
  composerJp?: string;
  titleJp?: string;
}

/** Tiny seed used while the API request is in flight, and as
 *  fallback if the network is unreachable. Never replaces the live
 *  catalog once loaded. */
export const LIBRARY_SEED: LibraryEntry[] = [
  {
    url:
      'https://cdn.jsdelivr.net/gh/musetrainer/library@' +
      LIBRARY_PINNED_SHA +
      '/scores/Pachelbel_Canon_in_D.mxl',
    label: 'Pachelbel — Canon in D',
    icon: '🎻',
  },
  {
    url:
      'https://cdn.jsdelivr.net/gh/musetrainer/library@' +
      LIBRARY_PINNED_SHA +
      '/scores/Satie_Gymnopedie_No._1.mxl',
    label: 'Satie — Gymnopédie No. 1',
    icon: '🌿',
  },
];

// =====================================================================
// Factory
// =====================================================================

/** Shape PianoCore.libraryEntryFromGhFile reads. */
export interface OnlineLibraryEntryFromGhFile {
  (
    f: { name: string; type?: string },
    opts: { pinnedSha: string; jpOverrides: typeof LIBRARY_JP }
  ): LibraryEntry;
}

/** Tiny localStorage subset we touch — production: window.localStorage,
 *  test: an in-memory map. */
export interface OnlineLibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface OnlineLibraryDeps {
  /** Held by deps so the test passes a stub without dragging the
   *  real PianoCore in. */
  libraryEntryFromGhFile: OnlineLibraryEntryFromGhFile;
  fetch: typeof fetch;
  localStorage: OnlineLibraryStorage;
  /** Production: `Date.now`. */
  now: () => number;
}

export interface OnlineLibrary {
  /** Adapter — calls libraryEntryFromGhFile with the pinned SHA + JP
   *  overrides baked in. Used both internally (when sorting fresh
   *  GitHub responses) and exposed for callers that need to convert
   *  one file at a time. */
  entryFromGhFile(f: { name: string; type?: string }): LibraryEntry;

  /** Read library entries — cache hit (≤1 h) bypasses GitHub
   *  entirely. Pass `force: true` to skip the cache and re-hit the
   *  API. Throws on non-OK GitHub responses (caller surfaces
   *  appropriately). */
  fetchEntries(force?: boolean): Promise<LibraryEntry[]>;
}

export function createOnlineLibrary(deps: OnlineLibraryDeps): OnlineLibrary {
  function entryFromGhFile(f: { name: string; type?: string }): LibraryEntry {
    return deps.libraryEntryFromGhFile(f, {
      pinnedSha: LIBRARY_PINNED_SHA,
      jpOverrides: LIBRARY_JP,
    });
  }

  async function fetchEntries(force?: boolean): Promise<LibraryEntry[]> {
    if (!force) {
      try {
        const raw = deps.localStorage.getItem(LIBRARY_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached.fetchedAt && deps.now() - cached.fetchedAt < LIBRARY_CACHE_TTL_MS) {
            // Defensive: drop any excluded (non-PD) file that a pre-v3 cache
            // shape or a future upstream change might still carry.
            return (cached.entries as LibraryEntry[]).filter(
              (e) => !e.filename || !LIBRARY_EXCLUDE.has(e.filename)
            );
          }
        }
      } catch {
        /* corrupt cache → fall through to network */
      }
    }
    const res = await deps.fetch(LIBRARY_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error('GitHub API ' + res.status);
    const json = (await res.json()) as { type: string; name: string }[];
    const entries = json
      .filter((f) => f.type === 'file' && /\.mxl$/i.test(f.name) && !LIBRARY_EXCLUDE.has(f.name))
      .map(entryFromGhFile)
      .sort((a, b) => a.label.localeCompare(b.label));
    try {
      deps.localStorage.setItem(
        LIBRARY_CACHE_KEY,
        JSON.stringify({ fetchedAt: deps.now(), entries })
      );
    } catch {
      /* localStorage quota / private mode — best effort */
    }
    return entries;
  }

  return { entryFromGhFile, fetchEntries };
}
