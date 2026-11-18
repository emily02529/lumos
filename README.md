# LUMOS 단어장 · 단어시험지

LUMOS 영어학원용 단어장 관리와 단어시험지(A4 PDF) 생성 사이트입니다.
설치나 서버 없이 `index.html`만 열면 동작합니다 (GitHub Pages 배포 가능).

## 기능

- **교재 폴더 → 단원** 구조로 단어장 정리
- 단어 입력: `문제번호 영어 뜻 영어 뜻 …` 형식으로 입력하면 표가 자동으로 만들어짐
  ```
  01 policy 정책 employee 종업원 gain 얻다
  02 gestural 몸짓의 nod 고개를 끄덕이다
  ```
  - 숫자만 있는 단어(`01`, `2`, `3.`)가 나오면 새 문제가 시작됨. 문제당 단어 개수는 자유
  - 띄어쓰기가 있는 영어(`give up`), 뜻(`고개를 끄덕이다`)도 하나로 묶임
- 단어장 목록 및 **단어장 PDF** 출력
- **시험지 만들기**: 단원(여러 개 가능)을 고른 뒤 출제 방식 선택
  - 영어 쓰기 / 뜻 쓰기 / 반반 섞기(무작위)
  - 단어 순서 섞기 옵션
  - 시험지 PDF와 답안지 PDF (A4 세로)
- 백업: 데이터는 브라우저(localStorage)에 저장되므로, 백업 탭에서 `.json`으로 내보내기/불러오기

## 파일

- `index.html`, `style.css`, `app.js`: 앱
- `lib/html2pdf.bundle.min.js`: PDF 생성 라이브러리 ([html2pdf.js](https://github.com/eKoopmans/html2pdf.js) 0.10.1, MIT)
