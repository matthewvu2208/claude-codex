# PLAN — Web luyện gõ phím bằng MỘT TAY PHẢI (Tiếng Việt + English)

> File này là bản kế hoạch cho Claude Code. Đọc toàn bộ trước khi viết code.
> Làm **từng Phase một**. Hết mỗi Phase: chạy test, tóm tắt những gì đã làm, rồi **dừng lại chờ người dùng duyệt**.

---

## 0. Bối cảnh người dùng (quan trọng, đọc kỹ)

- Người dùng đang **yếu tay phải**. Họ muốn **gõ toàn bộ bàn phím chỉ bằng tay phải, dùng đủ 5 ngón**, để tập cho tay phải. Tay trái **không dùng** khi gõ.
- Vì vậy:
  - Không được bắt người dùng bấm tổ hợp phím cần tay trái (Ctrl/Alt/Shift bên trái, Esc, Tab...). Mọi phím tắt phải nằm ở **nửa phải bàn phím** hoặc bấm được bằng chuột.
  - Mặc định chữ thường, không dấu câu (giống 10FastFingers) → không cần Shift.
  - Ưu tiên chữ to, ít áp lực, có chế độ không tính giờ và nhắc nghỉ tay.
- Ngôn ngữ luyện: **Tiếng Việt** và **English** (chọn một trong hai cho mỗi bài, không trộn trong cùng bài, vì bộ gõ tiếng Việt sẽ làm hỏng chữ tiếng Anh).
- Gõ tiếng Việt bằng **bộ gõ của máy** (Unikey / EVKey trên Windows, bộ gõ Telex có sẵn của macOS). Web **không** tự chuyển Telex, chỉ so sánh chữ đã có dấu.
- Giao diện bằng **tiếng Việt** (chuẩn bị sẵn i18n để sau này thêm giao diện tiếng Anh).

## 1. Các quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Cách gõ | Chỉ tay phải, 5 ngón (ngón cái bấm Space) |
| Bố cục bàn phím | QWERTY chuẩn (US) |
| Gõ dấu tiếng Việt | Bộ gõ của hệ điều hành; web chuẩn hoá và so sánh |
| Quy mô | Web tĩnh, dùng riêng, không tài khoản, dữ liệu lưu trong trình duyệt (localStorage) + xuất/nhập file JSON để sao lưu |
| Deploy | Vercel hoặc GitHub Pages (miễn phí) |
| Tính năng thêm | Claude Code tự quyết theo lộ trình bên dưới |

## 2. 10FastFingers vận hành thế nào (dùng làm khuôn mẫu)

- Bài test chuẩn: **60 giây**, các từ được bốc **ngẫu nhiên từ 200 từ phổ biến nhất** của ngôn ngữ. Chế độ "Advanced": bốc từ **1000 từ phổ biến nhất**.
- Màn hình: một khung chữ hiển thị **2 dòng** từ; bên dưới là **một ô nhập**. Từ hiện tại được tô nền. Gõ xong một từ thì bấm **Space** để sang từ tiếp theo.
- Khi đang gõ mà phần đã gõ **không khớp** đầu của từ hiện tại → tô đỏ ngay lập tức.
- Sau khi bấm Space: từ đúng tô **xanh**, từ sai tô **đỏ**. **Không quay lại** sửa từ trước được.
- Gõ hết dòng 1 thì khung cuộn lên, dòng 2 thành dòng 1.
- Đồng hồ bắt đầu chạy khi gõ phím đầu tiên. Hết giờ thì khoá ô nhập và hiện kết quả: WPM, số phím đúng | sai, độ chính xác, số từ đúng, số từ sai.
- Có nút làm lại (bộ từ mới).
- Ngoài ra có "Custom typing test" / "Text practice" (tự nhập văn bản).

App này giữ nguyên cách vận hành đó, và thêm phần dành riêng cho gõ một tay phải.

## 3. Tech stack

- **Vite + React + TypeScript** (strict mode)
- **Tailwind CSS**
- **React Router** dùng `HashRouter` (để chạy được trên GitHub Pages không cần cấu hình server)
- **Recharts** cho biểu đồ tiến bộ
- **Vitest** cho unit test, **Playwright** cho test end-to-end (Phase 4)
- ESLint + Prettier
- Không dùng backend. Không thêm thư viện state lớn; dùng `useReducer` + Context là đủ.

## 4. Cấu trúc thư mục

```
go-tay-phai/
  CLAUDE.md                 # quy ước dự án (tạo ở Phase 0, tóm tắt mục 0 và 1 của file này)
  PLAN.md                   # file này
  ATTRIBUTION.md            # nguồn danh sách từ + giấy phép
  scripts/
    build-wordlists.mjs     # tạo danh sách từ từ dữ liệu tần suất
  src/
    data/
      words/en-200.json  en-1000.json  vi-200.json  vi-1000.json
      fingerProfiles.ts     # bản đồ ngón tay (mục 5)
      keyboardLayout.ts     # các hàng phím QWERTY: code, nhãn, toạ độ
    lib/
      vietnamese.ts         # chuẩn hoá, tách khung chữ + thanh điệu, bỏ dấu, telexKeys, vniKeys
      generator.ts          # RNG có seed, sinh dãy từ, sinh theo trọng số
      scoring.ts            # công thức WPM, độ chính xác...
      fingers.ts            # fingerFor(code), zoneOf(code), độ khó của từ
      nextKey.ts            # phím tiếp theo cần bấm
      storage.ts            # localStorage có version + xuất/nhập JSON
    engine/
      typingReducer.ts      # máy trạng thái của bài test
      useTypingTest.ts
    components/
      WordBox.tsx  TypingInput.tsx  Timer.tsx  ResultCard.tsx
      VirtualKeyboard.tsx  HandZoneBadge.tsx  KeyHint.tsx
      ImeWarning.tsx  BreakReminder.tsx  HistoryChart.tsx  FingerStats.tsx
    pages/
      TestPage.tsx  DrillPage.tsx  StatsPage.tsx  SettingsPage.tsx  HelpPage.tsx
    i18n/
      vi.ts  en.ts
  tests/ (hoặc *.test.ts đặt cạnh file)
```

## 5. Bản đồ ngón tay cho một tay phải (profile mặc định "Hai vị trí neo")

Tay phải phải phủ cả bàn phím, nên tay **di chuyển giữa 2 vùng**. Trong mỗi vùng, các ngón dùng giống hệt cách gõ 10 ngón của tay phải (ngón trỏ lo 2 cột, mỗi ngón còn lại lo 1 cột).

**Vùng PHẢI** — vị trí đặt tay: trỏ `J`, giữa `K`, áp út `L`, út `;`

| Ngón | Phím (theo `KeyboardEvent.code`) |
|---|---|
| Trỏ | `6 7 Y U H J N M` |
| Giữa | `8 I K ,` |
| Áp út | `9 O L .` |
| Út | `0 - = P [ ] \ ; ' /` `Enter` `Backspace` |

**Vùng TRÁI** — tay dịch sang trái 5 cột; vị trí đặt tay: trỏ `S`, giữa `D`, áp út `F`, út `G` (ngón trỏ duỗi sang `A`)

| Ngón | Phím |
|---|---|
| Trỏ | `` ` 1 2 Q W A S Z X `` |
| Giữa | `3 E D C` |
| Áp út | `4 R F V` |
| Út | `5 T G B` |

**Ngón cái:** `Space` (cả hai vùng).

Yêu cầu kỹ thuật:
- Lưu profile dưới dạng dữ liệu: `Record<KeyCode, { zone: 'left' | 'right'; finger: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky' }>` + danh sách phím đặt tay (home keys) của mỗi vùng.
- Code phải đọc từ profile, **không hard-code** ngón ở nơi khác, để Phase 3 thêm được trình chỉnh sửa profile (người dùng tự gán phím cho ngón).
- Mỗi ngón có một màu riêng (5 màu, đủ tương phản, dùng được cho người mù màu). Bàn phím ảo tô màu theo ngón.
- `zoneSwitches(keys)`: số lần tay phải đổi vùng khi gõ một từ. Dùng để xếp độ khó (từ chỉ nằm trong một vùng = dễ).

## 6. Danh sách từ và cách sinh đề

### 6.1 Tạo danh sách từ (`scripts/build-wordlists.mjs`)
- Nguồn đề xuất: repo **hermitdave/FrequencyWords** (danh sách tần suất từ phụ đề OpenSubtitles; dữ liệu theo giấy phép **CC BY-SA 4.0**). Tệp nằm trong thư mục `content/2018/<lang>/` (kiểm tra lại đường dẫn khi chạy). Định dạng mỗi dòng: `từ số_lần`.
- English: giữ từ khớp `/^[a-z]+$/`; bỏ chữ cái đơn trừ `a`, `i`; bỏ từ tục; bỏ tên riêng hay gặp.
- Tiếng Việt (mỗi "từ" là **một âm tiết**, giống 10FastFingers):
  - `normalize('NFC')`, chữ thường.
  - Chỉ giữ token gồm chữ cái tiếng Việt; phải là **âm tiết tiếng Việt hợp lệ** (viết hàm `isVietnameseSyllable`: phụ âm đầu hợp lệ + vần hợp lệ + tối đa 1 thanh).
  - Bỏ token tiếng Anh lẫn vào, bỏ từ tục, bỏ tên riêng.
  - Chuẩn hoá vị trí dấu thanh về **kiểu mới** (`hòa`, `thủy`, `khỏe`) để hiển thị thống nhất.
- Lấy top 200 và top 1000, ghi ra `src/data/words/*.json`. Sau khi tạo, Claude Code **tự đọc lại** danh sách và loại các từ vô nghĩa/không phù hợp.
- Ghi nguồn và giấy phép vào `ATTRIBUTION.md` và trang Trợ giúp.
- Nếu không tải được dữ liệu: Claude Code tự soạn danh sách từ phổ biến và ghi rõ điều đó trong `ATTRIBUTION.md`.

### 6.2 Sinh dãy từ cho bài test (`generator.ts`)
- RNG có seed (ví dụ mulberry32) để test được và tái tạo được bài.
- `generateWords(pool, count, seed)`: bốc ngẫu nhiên đều từ `pool`; **không lặp cùng một từ trong 5 từ gần nhất**.
- Sinh sẵn khoảng 300 từ; nếu người dùng gõ gần hết thì sinh thêm.
- `generateWeighted(pool, weightFn, count, seed)`: dùng cho bài luyện theo ngón / theo phím yếu (Phase 3).
- Với tiếng Việt, dãy phím của một từ = dãy phím Telex (hoặc VNI) của từ đó (mục 7.4); với English = các chữ cái. Độ khó, tải theo ngón và số lần đổi vùng đều tính trên dãy phím này.

## 7. Engine gõ phím

### 7.1 Ô nhập và bộ gõ tiếng Việt (phần dễ sai nhất)
- Dùng `<input>` thật (không tự bắt từng phím rồi tự ghép chữ), vì bộ gõ của máy cần một ô nhập thật để hoạt động.
- Thuộc tính: `autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"`.
- **Đọc giá trị ô nhập trong sự kiện `input`**, không dựa vào `keydown` để xác định chữ đã gõ. Lý do:
  - Unikey/EVKey trên Windows sửa chữ bằng cách gửi Backspace giả rồi gõ lại ký tự có dấu.
  - Bộ gõ macOS dùng composition (`compositionstart` / `compositionupdate` / `compositionend`, chữ đang gõ có gạch chân).
- Nộp từ khi giá trị ô nhập **kết thúc bằng dấu cách** và **không đang composition** (`isComposing === false`). Nếu đang composition thì chờ `compositionend` rồi kiểm tra lại. Từ nộp = giá trị bỏ khoảng trắng. Ô trống mà bấm Space thì bỏ qua.
- Phải thử trên: Windows + Unikey (Telex, Unicode dựng sẵn) trên Chrome và Edge; Windows + EVKey; macOS + bộ gõ Telex có sẵn trên Chrome và Safari. Ghi kết quả vào `docs/ime-test.md`.

### 7.2 So sánh chữ tiếng Việt (`vietnamese.ts`)
- `nfc(s)`: `s.normalize('NFC').toLowerCase()` (gỡ khác biệt giữa Unicode dựng sẵn và tổ hợp).
- `splitTone(syllable) → { skeleton, tone }`:
  - Tách NFD, lấy ra dấu thanh: U+0300 (huyền), U+0301 (sắc), U+0309 (hỏi), U+0303 (ngã), U+0323 (nặng).
  - **Giữ** dấu mũ/trăng/móc (U+0302, U+0306, U+031B) và chữ `đ`.
  - `skeleton` = phần còn lại (đổi về NFC), `tone` = loại thanh hoặc `none`.
- **So khớp chặt** (khi nộp từ): đúng khi `skeleton` và `tone` đều trùng. Cách này chấp nhận cả dấu kiểu cũ lẫn kiểu mới (`hoà` = `hòa`, `thuỷ` = `thủy`, `khoẻ` = `khỏe`) mà không cần bảng tra.
- `stripAll(s)`: NFD, bỏ mọi dấu U+0300–U+036F, `đ → d`.
- **So khớp lỏng khi đang gõ** (để tô đỏ tức thời): coi là đang đúng khi `stripAll(typed)` là **tiền tố** của `stripAll(target)`. Nhờ vậy khi gõ Telex, các trạng thái trung gian (`v`, `vi`, `vie`, `viê`, `việ`) không bị đỏ oan. Nếu bộ gõ đang tắt và người dùng gõ `vieej` thì sẽ đỏ, đúng như mong muốn.
- English: so khớp chặt = bằng nhau; khi đang gõ = `target.startsWith(typed)`.

### 7.3 Cảnh báo bộ gõ (`ImeWarning`)
- Bài **English** mà ô nhập xuất hiện ký tự ngoài ASCII → hiện banner: "Bộ gõ tiếng Việt đang bật, hãy tắt để gõ tiếng Anh."
- Bài **Tiếng Việt** mà sau 5 từ, những từ đích có dấu đều bị nộp không dấu, hoặc ô nhập xuất hiện chuỗi kiểu Telex thô (`aa`, `dd`, `ee`, `oo`, hoặc ký tự `s f r x j w` ở cuối mà đích không có) → banner: "Có vẻ bộ gõ tiếng Việt chưa bật."
- Banner không chặn bài test, chỉ nhắc.

### 7.4 Gợi ý phím (`nextKey.ts`, `KeyHint`)
- `telexKeys(word)`: đổi từ đích thành dãy phím Telex chuẩn, **dấu thanh đặt ở cuối từ** (Unikey/EVKey/macOS đều cho phép gõ dấu cuối):
  - `â→aa, ă→aw, ê→ee, ô→oo, ơ→ow, ư→uw, đ→dd`; thanh: sắc `s`, huyền `f`, hỏi `r`, ngã `x`, nặng `j`.
  - Ví dụ: `việt → v i e e t j`; `đường → d d u w o w n g f`; `người → n g u w o w i f`; `không → k h o o n g`; `của → c u a r`.
- `vniKeys(word)`: `â a6, ă a8, ê e6, ô o6, ơ o7, ư u7, đ d9`; thanh `1..5` (sắc, huyền, hỏi, ngã, nặng) ở cuối. Ví dụ: `việt → v i e 6 t 5`.
- Cài đặt "Kiểu gợi ý dấu": Telex (mặc định) / VNI, phải trùng với kiểu người dùng đặt trong Unikey.
- Tính **phím tiếp theo**:
  - English: nếu đang đúng → `target[typed.length]`; nếu đang sai → `Backspace`; gõ xong từ → `Space`.
  - Tiếng Việt: tách đích thành `baseKeys` (không có phím thanh) + `toneKey`. Đổi phần đã gõ thành `baseKeys` theo cùng quy tắc, lấy tiền tố chung → phím tiếp theo là phím đầu tiên chưa khớp. Hết `baseKeys`: nếu thanh của phần đã gõ chưa đúng → `toneKey`, ngược lại → `Space`. Nếu phần đã gõ sai (so khớp lỏng thất bại) → `Backspace`.
- `KeyHint` hiển thị dưới từ hiện tại, ví dụ `v i e e t j`, các phím đã xong thì mờ đi, phím tiếp theo thì đậm. Có nút bật/tắt.
- Gợi ý chỉ để tham khảo: **chấm điểm luôn dựa trên chữ cuối cùng**, không dựa trên thứ tự phím.

### 7.5 Máy trạng thái bài test (`typingReducer.ts`)
- Trạng thái: `idle → running → finished`.
  - `idle`: đã có dãy từ, con trỏ ở ô nhập, đồng hồ hiện thời lượng.
  - `running`: bắt đầu ở sự kiện `input` đầu tiên có ký tự.
  - `finished`: hết giờ (hoặc gõ đủ số từ ở chế độ không tính giờ) → khoá ô nhập, tính kết quả, lưu lịch sử.
- Dữ liệu: `words[]`, `currentIndex`, `currentInput`, `wordResults[] { target, typed, correct }`, `startedAt`, các sự kiện phím (mục 9).
- Đồng hồ dùng `performance.now()` và `requestAnimationFrame` (hoặc interval 100ms), không cộng dồn `setInterval(1000)` để tránh lệch giờ.
- Thời lượng: 15 / 30 / **60** (mặc định) / 120 giây, và "Không giới hạn" (gõ N từ, mặc định 25).
- Khung chữ: 2 dòng như 10FastFingers; dùng `offsetTop` của từng `<span>` để biết khi nào từ hiện tại xuống dòng 2 thì cuộn. Cỡ chữ chỉnh được (mặc định to, khoảng 28px).

### 7.6 Công thức chấm điểm (`scoring.ts`)
- Độ dài ký tự tính trên chuỗi NFC.
- `correctChars` = tổng ký tự của các từ đúng + 1 dấu cách cho mỗi từ đúng.
- `wrongChars` = với mỗi từ sai: `max(len(target), len(typed))` + 1 dấu cách.
- **WPM** = `(correctChars / 5) / (giây / 60)` (mỗi "từ" chuẩn = 5 ký tự, tính cả dấu cách).
- **Raw WPM** = `((correctChars + wrongChars) / 5) / (giây / 60)`.
- **Độ chính xác** = `correctChars / (correctChars + wrongChars)`.
- **Từ đúng/phút** = số từ đúng ÷ phút (dễ hiểu hơn với tiếng Việt vì âm tiết ngắn).
- **Phím/phút** = số lần bấm phím vật lý (mục 9) ÷ phút, cho thấy tay đã làm việc bao nhiêu (gõ Telex tốn nhiều phím hơn số chữ).
- Kết quả hiển thị giống 10FastFingers: WPM to ở giữa; bên dưới là phím đúng | sai, độ chính xác, từ đúng, từ sai, cộng thêm Từ/phút và Phím/phút. Danh sách các từ sai: `đích → đã gõ`.

## 8. Giao diện

- **Trang Luyện gõ** (trang chính):
  - Thanh trên: chọn ngôn ngữ (Tiếng Việt / English), bộ từ (200 / 1000), thời lượng.
  - Khung 2 dòng chữ → ô nhập + đồng hồ + nút làm lại.
  - `HandZoneBadge`: "Tay ở vùng TRÁI / PHẢI" theo phím tiếp theo.
  - `VirtualKeyboard`: bàn phím QWERTY tô màu theo ngón, phím tiếp theo sáng lên kèm tên ngón ("Áp út"), các phím đặt tay của vùng hiện tại được viền. Phím đang bấm nháy lên (lấy từ `keydown`).
  - `KeyHint` (Telex/VNI) dưới từ hiện tại khi luyện tiếng Việt.
- **Trang Bài luyện ngón** (Phase 3): chọn ngón hoặc chọn vùng, sinh bài theo trọng số.
- **Trang Thống kê**: biểu đồ WPM và độ chính xác theo thời gian (lọc theo ngôn ngữ), tốc độ trung bình theo **từng ngón**, bản đồ nhiệt bàn phím (chậm/sai), tổng thời gian luyện mỗi ngày.
- **Trang Cài đặt**: cỡ chữ, sáng/tối, bật/tắt bàn phím ảo, gợi ý dấu (Telex/VNI/tắt), nhắc nghỉ, profile ngón tay, xuất/nhập/xoá dữ liệu.
- **Trang Trợ giúp**: cách đặt tay ở 2 vùng (có hình minh hoạ bằng bàn phím ảo), cách bật/tắt Unikey/EVKey/bộ gõ macOS, cách tính điểm, nguồn danh sách từ.
- Mọi nút bấm được bằng chuột và có thứ tự focus hợp lý. Tương phản màu đạt WCAG AA.

## 9. Ghi nhận phím và thống kê theo ngón

- Lắng nghe `keydown` trên ô nhập; chỉ ghi các sự kiện có `event.code` nằm trong profile (chữ cái, số, dấu câu, `Space`). **Dùng `event.code`, không dùng `event.key`**, vì khi bộ gõ đang hoạt động `key` có thể là `"Process"`, còn `code` vẫn là phím vật lý.
- Bỏ qua các sự kiện không có `code` hoặc `code` lạ (một số bộ gõ gửi ký tự giả).
- Mỗi sự kiện: `{ code, t }`. Khoảng cách giữa hai phím liên tiếp, giới hạn trên 2000ms (dài hơn coi là đang nghỉ, không tính).
- Tổng hợp: số lần bấm và khoảng cách trung bình theo **phím** và theo **ngón**.
- Lỗi theo phím:
  - English: khi ký tự mới gõ không khớp ký tự đích tại vị trí đó → ghi lỗi cho phím **đáng lẽ phải bấm** (và ngón của phím đó).
  - Tiếng Việt: chỉ ghi lỗi theo từ (không ghi theo phím, vì bộ gõ làm phím và chữ không khớp 1-1).
- Backspace: chỉ đếm số lần sửa ở bài English (ở bài tiếng Việt bộ gõ tự gửi Backspace giả nên không đáng tin).

## 10. Lưu trữ (`storage.ts`)

- Khoá localStorage có version: `gtp:v1:settings`, `gtp:v1:results`.
- `TestResult`: `id, createdAt, lang, wordSet, mode, durationSec, wpm, rawWpm, accuracy, correctWords, wrongWords, correctChars, wrongChars, keysPerMin, perKey, perFinger, wrongList, profileId, seed`.
- Bọc mọi thao tác đọc/ghi trong `try/catch`; khi dữ liệu hỏng hoặc khác version thì migrate hoặc reset an toàn, không làm sập app.
- Giới hạn khoảng 2000 kết quả gần nhất (cũ hơn thì gộp thành thống kê theo ngày).
- **Xuất JSON / Nhập JSON** để sao lưu (dữ liệu trình duyệt có thể bị mất khi xoá cache).

## 11. Tính năng hỗ trợ tay yếu

- Chế độ "Không giới hạn thời gian" (gõ N từ, không có đồng hồ đếm ngược).
- **Nhắc nghỉ tay**: sau X phút gõ liên tục (mặc định 10, chỉnh được hoặc tắt) hiện lớp phủ "Nghỉ tay một chút" với đồng hồ đếm 1–2 phút, có nút bỏ qua.
- Hiện tổng thời gian luyện trong ngày.
- **Bài luyện theo ngón** (Phase 3): chọn ngón (ví dụ áp út, út) → ưu tiên từ mà phần lớn phím thuộc ngón đó (`generateWeighted`, trọng số = tỉ lệ phím của ngón đó trong dãy phím của từ).
- **Bài theo độ khó vùng**: Dễ = từ chỉ nằm trong 1 vùng; Vừa = đổi vùng 1–2 lần; Khó = đổi vùng nhiều lần.
- **Thích ứng** (Phase 3): tăng trọng số cho từ chứa các phím chậm hoặc hay sai nhất của người dùng.
- Không dùng âm thanh, hiệu ứng gây áp lực; không đặt chỉ tiêu bắt buộc.

## 12. Phím tắt (chỉ dùng phím nửa phải)

- `Enter`: làm bài mới (khi đang ở màn hình kết quả hoặc chưa bắt đầu). Khi đang làm bài, `Enter` không làm gì để tránh lỡ tay.
- `Esc` cũng làm bài mới (cho ai dùng được), nhưng không bắt buộc phải dùng.
- Sau khi bấm làm lại, con trỏ phải tự về ô nhập.
- Không dùng tổ hợp phím có Ctrl/Alt/Cmd.

## 13. Kiểm thử

### Unit test bắt buộc (Vitest)
- `splitTone` / so khớp chặt:
  - `hoà = hòa`, `thuỷ = thủy`, `khoẻ = khỏe`, `hoàng = hoàng`.
  - Chuỗi NFD bằng chuỗi NFC cùng chữ.
  - `ma ≠ má ≠ mà ≠ mả ≠ mã ≠ mạ`; `da ≠ đa`; `tho ≠ thơ ≠ thô`.
- So khớp lỏng: đích `việt` → `v`, `vi`, `vie`, `viê`, `việ`, `việt` đều hợp lệ; `vieej` không hợp lệ; đích `đi` → gõ `d` hợp lệ.
- `telexKeys`: `việt`, `đường`, `người`, `không`, `của`, `những (n h u w n g x)`, `được (d d u w o w c j)`.
- `vniKeys`: `việt → v i e 6 t 5`, `đường → d 9 u 7 o 7 n g 2`.
- `nextKey`: các bước gõ `việt` theo thứ tự, cả trường hợp gõ dấu sớm (`việ` → tiếp theo `t`, sau đó `Space`).
- `generateWords`: cùng seed → cùng kết quả; không lặp từ trong 5 từ gần nhất; mọi từ thuộc pool.
- `scoring`: một ví dụ tính tay cho thời lượng 60s và 30s.
- `fingerFor`: `KeyT → trái/út`, `KeyA → trái/trỏ`, `KeyJ → phải/trỏ`, `Semicolon → phải/út`, `Space → ngón cái`.
- `zoneSwitches`: `the` (T trái, H phải, E trái) = 2; `you` = 0.
- `isVietnameseSyllable`: nhận `nghiêng`, `quyết`, `giữ`; loại `the`, `abc`, `ngh`.
- `storage`: dữ liệu hỏng không làm sập app; xuất rồi nhập lại thì giữ nguyên dữ liệu.

### Tiêu chí nghiệm thu thủ công
- Làm trọn một bài 60s tiếng Việt bằng Unikey Telex: không bị nhân đôi chữ, không đỏ oan khi đang gõ dở, từ đúng xanh, từ sai đỏ.
- Bài English khi quên tắt Unikey → hiện cảnh báo.
- Toàn bộ bài test và màn hình kết quả dùng được mà không cần chạm tay trái.

## 14. Lộ trình

### Phase 0 — Khởi tạo
- Tạo dự án Vite React TS, Tailwind, Vitest, ESLint/Prettier, `CLAUDE.md`.
- **Xong khi:** `npm run dev`, `npm test`, `npm run build` đều chạy.

### Phase 1 — MVP giống 10FastFingers
- `scripts/build-wordlists.mjs` + 4 file JSON + `ATTRIBUTION.md`.
- `vietnamese.ts`, `generator.ts`, `scoring.ts`, `typingReducer.ts` kèm unit test.
- Trang Luyện gõ: khung 2 dòng, ô nhập (xử lý bộ gõ như mục 7.1), đồng hồ, kết quả, làm lại, chọn ngôn ngữ/bộ từ/thời lượng.
- Cảnh báo bộ gõ, lưu kết quả vào localStorage, danh sách lịch sử đơn giản.
- **Xong khi:** mọi unit test ở mục 13 liên quan đều qua; làm được bài trọn vẹn cả hai ngôn ngữ.

### Phase 2 — Gõ một tay phải
- `fingerProfiles.ts`, `keyboardLayout.ts`, `fingers.ts`, `nextKey.ts`.
- `VirtualKeyboard`, `HandZoneBadge`, `KeyHint` (Telex/VNI).
- Ghi nhận phím (mục 9), trang Thống kê: biểu đồ WPM/độ chính xác, tốc độ theo ngón, bản đồ nhiệt.
- Trang Cài đặt cơ bản, trang Trợ giúp (cách đặt tay 2 vùng, cách bật/tắt bộ gõ).
- **Xong khi:** gợi ý phím đúng trong mọi test ở mục 13; thống kê theo ngón hiển thị sau mỗi bài.

### Phase 3 — Luyện tập và phục hồi
- Chế độ không giới hạn thời gian, nhắc nghỉ tay, thời gian luyện trong ngày.
- Bài luyện theo ngón, theo độ khó vùng, chế độ thích ứng.
- Tự nhập văn bản (dán đoạn văn để luyện; tuỳ chọn giữ hoa/thường và dấu câu).
- Trình chỉnh sửa profile ngón tay (bấm vào phím trên bàn phím ảo để gán ngón/vùng).
- Bài học tăng dần (tuỳ chọn): mở khoá phím dần, bắt đầu từ các phím đặt tay vùng phải, rồi tới vùng trái, thứ tự theo tần suất phím; mở phím mới khi đạt tốc độ mục tiêu.
- Xuất/nhập dữ liệu JSON.

### Phase 4 — Hoàn thiện và đưa lên mạng
- Test end-to-end bằng Playwright cho luồng làm bài English (bộ gõ tiếng Việt không giả lập được, nên kiểm tra bằng tay theo `docs/ime-test.md`).
- Kiểm tra khả năng truy cập (focus, tương phản, cỡ chữ).
- Tuỳ chọn: PWA để dùng offline (`vite-plugin-pwa`).
- Deploy lên Vercel hoặc GitHub Pages (GitHub Actions; nhớ chỉnh `base` trong `vite.config.ts` nếu dùng Pages). Viết `README.md` hướng dẫn chạy và deploy.

## 15. Ngoài phạm vi

- Tài khoản, bảng xếp hạng, thi đấu nhiều người.
- Trộn tiếng Việt và tiếng Anh trong cùng một bài.
- Chế độ bàn phím gương (Half-QWERTY): không làm được ổn định khi dùng bộ gõ của hệ điều hành, vì bộ gõ xử lý phím trước khi trình duyệt nhận được.
- Gõ trên điện thoại/màn hình cảm ứng.

## 16. Quy ước làm việc cho Claude Code

- TypeScript strict, không dùng `any` nếu không có lý do.
- Logic thuần (chuẩn hoá, sinh từ, chấm điểm, gợi ý phím) nằm trong `src/lib`, không phụ thuộc React, và luôn có unit test.
- Chuỗi giao diện đặt trong `src/i18n/vi.ts`, không viết cứng trong component.
- Mỗi Phase một commit (hoặc vài commit nhỏ) với message rõ ràng.
- Khi gặp điểm chưa rõ mà ảnh hưởng tới trải nghiệm gõ một tay, hỏi người dùng thay vì tự đoán.
