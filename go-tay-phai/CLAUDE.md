# CLAUDE.md — Gõ tay phải

Web tĩnh luyện gõ phím **chỉ bằng tay phải, đủ 5 ngón** (tiếng Việt + English).
Kế hoạch đầy đủ: `PLAN.md`. Làm từng Phase; hết mỗi Phase chạy test, tóm tắt rồi dừng chờ duyệt.

## Người dùng

- Tay phải đang yếu; gõ toàn bộ bàn phím bằng tay phải, tay trái **không dùng**.
- Không bắt bấm phím/tổ hợp cần tay trái (Ctrl/Alt/Shift trái, Esc, Tab). Phím tắt chỉ ở nửa phải
  bàn phím (Enter) hoặc bấm được bằng chuột. Không dùng Ctrl/Alt/Cmd.
- Mặc định chữ thường, không dấu câu (không cần Shift). Chữ to, ít áp lực, không âm thanh.
- Mỗi bài chỉ một ngôn ngữ: Tiếng Việt **hoặc** English (không trộn).
- Tiếng Việt gõ bằng bộ gõ của máy (Unikey/EVKey, Telex/VNI của macOS). Web không tự chuyển Telex,
  chỉ chuẩn hoá và so sánh chữ đã có dấu.
- Giao diện tiếng Việt; chuỗi nằm trong `src/i18n/vi.ts` (có sẵn `en.ts`).

## Quyết định đã chốt

- Chỉ tay phải, 5 ngón (ngón cái bấm Space); QWERTY US.
- Web tĩnh, không tài khoản; dữ liệu ở localStorage (`gtp:v1:*`) + xuất/nhập JSON.
- Deploy: Vercel hoặc GitHub Pages (`HashRouter`, `base: './'`).

## Lệnh

npm run dev | npm test | npm run build | npm run lint | npm run typecheck | npm run wordlists

## Quy ước

- Vite + React + TypeScript strict + Tailwind v4; Vitest; `useReducer` + Context, không thư viện state.
- Logic thuần (`src/lib`, reducer trong `src/engine`) không phụ thuộc React và luôn có unit test.
- Màu chỉ lấy từ token trong `src/index.css` (`bg-bg`, `text-text`, `text-ok`, `text-bad`, ...).
  Đạt tương phản WCAG AA ở cả hai theme. Không đặt token tên trùng tiện ích Tailwind (vd. `current`).
- Ô nhập là `<input>` thật, không điều khiển bởi React (uncontrolled); đọc giá trị trong sự kiện
  `input`, chờ `compositionend` khi đang composition. Ghi phím bằng `event.code`, không dùng `event.key`.
- Bản đồ ngón tay (Phase 2) là dữ liệu trong `src/data/fingerProfiles.ts`; không hard-code ngón ở nơi khác.
- Không dùng `any` nếu không có lý do. Mỗi Phase một hoặc vài commit rõ ràng.
- Gặp điểm chưa rõ ảnh hưởng tới trải nghiệm gõ một tay: hỏi người dùng.
