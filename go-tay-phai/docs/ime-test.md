# Kiểm thử bộ gõ tiếng Việt (thủ công)

Bộ gõ của hệ điều hành không giả lập được trong test tự động, nên cần thử bằng tay.
Với mỗi dòng: làm một bài **Tiếng Việt 60 giây** rồi một bài **English 15 giây** (quên tắt bộ gõ).

Kiểm tra:

1. Gõ dở một từ không bị đỏ oan (ví dụ `v → vi → vie → viê → việ → việt`).
2. Không bị nhân đôi chữ, không mất chữ sau khi bấm Space.
3. Từ đúng tô xanh, từ sai tô đỏ (có gạch sóng).
4. Gõ dấu thanh cuối từ (`vieetj`) vẫn được tính đúng.
5. Bài English khi bộ gõ tiếng Việt đang bật: hiện cảnh báo.
6. Bài tiếng Việt khi bộ gõ tắt: hiện cảnh báo "Có vẻ bộ gõ tiếng Việt chưa bật".
7. Toàn bộ bài và màn hình kết quả dùng được không cần tay trái (Enter để làm bài mới).

| Hệ điều hành | Bộ gõ                     | Kiểu gõ | Trình duyệt | Kết quả  | Ghi chú |
| ------------ | ------------------------- | ------- | ----------- | -------- | ------- |
| Windows      | Unikey (Unicode dựng sẵn) | Telex   | Chrome      | chưa thử |         |
| Windows      | Unikey (Unicode dựng sẵn) | Telex   | Edge        | chưa thử |         |
| Windows      | EVKey                     | Telex   | Chrome      | chưa thử |         |
| macOS        | Bộ gõ tiếng Việt có sẵn   | Telex   | Chrome      | chưa thử |         |
| macOS        | Bộ gõ tiếng Việt có sẵn   | Telex   | Safari      | chưa thử |         |

## Đã kiểm tra tự động (Chromium, giả lập)

- Sự kiện `input` với các trạng thái Telex trung gian: không đỏ oan.
- Chuỗi NFD (Unicode tổ hợp) được tính đúng như NFC.
- Space đến khi đang composition (`isComposing = true`): chỉ nộp từ sau `compositionend`.
- Gõ `vieej` (bộ gõ tắt): ô nhập đỏ và hiện cảnh báo.
