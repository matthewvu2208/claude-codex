/** Vietnamese UI strings (default). Keep keys in sync with en.ts. */
export const vi = {
  appName: 'Gõ tay phải',
  tagline: 'Luyện gõ bằng một tay phải',
  nav: { test: 'Luyện gõ', history: 'Lịch sử', main: 'Điều hướng chính' },
  options: {
    language: 'Ngôn ngữ',
    wordSet: 'Bộ từ',
    duration: 'Thời gian',
    wordCount: 'Số từ',
    fontSize: 'Cỡ chữ',
    smaller: 'Chữ nhỏ hơn',
    larger: 'Chữ to hơn',
    langVi: 'Tiếng Việt',
    langEn: 'English',
    words: (n: number) => `${n} từ`,
    seconds: (n: number) => `${n} giây`,
    unlimited: 'Không giới hạn',
  },
  test: {
    inputLabel: 'Ô gõ: gõ từ đang được tô sáng rồi bấm Space',
    restart: 'Làm bài mới',
    restartHint: 'Bấm Enter để làm bài mới',
    startHint: 'Bắt đầu gõ để chạy đồng hồ. Gõ xong mỗi từ thì bấm Space.',
    wordsProgress: (done: number, total: number) => `${done}/${total} từ`,
    timeLeft: 'Thời gian còn lại',
    elapsed: 'Thời gian đã gõ',
    wordBox: 'Các từ cần gõ',
  },
  ime: {
    onInEnglish: 'Bộ gõ tiếng Việt đang bật, hãy tắt để gõ tiếng Anh.',
    offInVietnamese:
      'Có vẻ bộ gõ tiếng Việt chưa bật. Hãy bật Unikey/EVKey (Telex hoặc VNI) hoặc bộ gõ tiếng Việt của máy.',
  },
  result: {
    title: 'Kết quả',
    wpm: 'WPM',
    wpmLong: 'từ chuẩn mỗi phút (5 ký tự = 1 từ)',
    rawWpm: 'WPM thô',
    keystrokes: 'Phím đúng | sai',
    accuracy: 'Độ chính xác',
    correctWords: 'Từ đúng',
    wrongWords: 'Từ sai',
    wordsPerMin: 'Từ/phút',
    keysPerMin: 'Phím/phút',
    wrongList: 'Các từ gõ sai',
    wrongItem: (target: string, typed: string) => `${target} → ${typed}`,
    noWrong: 'Không có từ nào sai.',
    saved: 'Đã lưu vào lịch sử.',
    notSaved: 'Không lưu được kết quả (bộ nhớ trình duyệt bị chặn).',
  },
  history: {
    title: 'Lịch sử luyện gõ',
    empty: 'Chưa có bài nào. Làm một bài ở trang Luyện gõ nhé.',
    date: 'Thời điểm',
    lang: 'Ngôn ngữ',
    set: 'Bộ từ',
    mode: 'Chế độ',
    wpm: 'WPM',
    accuracy: 'Chính xác',
    words: 'Từ đúng/sai',
    timed: (s: number) => `${s} giây`,
    untimed: (s: number) => `${s} giây (không giới hạn)`,
    count: (n: number) => `${n} bài gần nhất`,
  },
} as const;

type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : { [K in keyof T]: Widen<T[K]> };

export type Strings = Widen<typeof vi>;
