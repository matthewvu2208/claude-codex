# Nguồn dữ liệu

## Danh sách từ (`src/data/words/*.json`)

Tạo bởi `scripts/build-wordlists.mjs` từ **FrequencyWords** của Hermit Dave
(<https://github.com/hermitdave/FrequencyWords>), tệp `content/2018/en/en_50k.txt` và
`content/2018/vi/vi_50k.txt`. Dữ liệu gốc lấy từ phụ đề OpenSubtitles 2018
(<http://www.opensubtitles.org/>).

- Mã nguồn FrequencyWords: giấy phép MIT.
- Dữ liệu (các danh sách tần suất): **CC BY-SA 4.0** (<https://creativecommons.org/licenses/by-sa/4.0/>).

Các tệp `en-200.json`, `en-1000.json`, `vi-200.json`, `vi-1000.json` là tác phẩm phái sinh
của dữ liệu trên và được chia sẻ theo cùng giấy phép **CC BY-SA 4.0**.

Những thay đổi so với dữ liệu gốc:

- English: chỉ giữ từ khớp `^[a-z]+$`; bỏ chữ cái đơn (trừ `a`, `i`), mảnh của từ rút gọn
  (`don`, `ll`, ...), từ cảm thán, từ tục, tên riêng hay gặp và chú thích âm thanh trong phụ đề.
- Tiếng Việt: chuẩn hoá NFC, chữ thường; chỉ giữ âm tiết tiếng Việt hợp lệ; bỏ token tiếng Anh
  lẫn vào, từ cảm thán một âm, chữ cái đơn và từ tục; thống nhất vị trí dấu thanh
  (`hòa`, `thủy`, `khỏe`) và gộp tần suất các cách viết trùng nhau.
- Lấy 200 và 1000 từ phổ biến nhất sau khi lọc.
