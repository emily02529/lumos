# LUMOS 단어장 · 단어시험지

LUMOS 영어학원용 단어장 관리와 단어시험지(A4 PDF) 생성 사이트입니다.
https://lumos.naru.pub 에서 쓰며, 단어장은 Firebase(무료)에 저장되어 어느 컴퓨터에서든 같은 내용이 보입니다.

## 기능

- **교재 폴더 → 단원** 구조로 단어장 정리
- 단어 입력: `문제번호 영어 뜻 영어 뜻 …` 형식으로 입력하면 표가 자동으로 만들어짐
  ```
  01 policy 정책 employee 종업원 gain 얻다
  02 gestural 몸짓의 nod 고개를 끄덕이다
  ```
  - 숫자만 있는 단어(`01`, `2`, `3.`)가 나오면 새 문제가 시작됨. 문제당 단어 개수는 자유
  - 띄어쓰기가 있는 영어(`give up`), 뜻(`고개를 끄덕이다`)도 하나로 묶임
- 입력하면서 바로 확인
  - **중복**: 같은 단원에 같은 영어 단어가 또 있으면 경고, 다른 단원에 이미 있는 단어도 알림 (뜻이 다르면 함께 표시)
  - **철자**: Hunspell en_US 사전으로 영어 철자 확인, 추천 단어를 누르면 바로 고침 (`무시`는 이 브라우저에 저장)
  - **자동완성**: 영어 두 글자 이상 → 전에 입력한 단어(뜻까지)와 사전 단어 추천, `Tab`으로 넣기
- 단어장 목록 및 **단어장 PDF** 출력
- **시험지 만들기**: 단원(여러 개 가능)을 고른 뒤 출제 방식 선택
  - 영어 쓰기 / 뜻 쓰기 / 반반 섞기(무작위)
  - 단어 순서 섞기 옵션
  - 시험지 PDF와 답안지 PDF (A4 세로)
- 학원 공용 계정(이메일/비밀번호)으로 로그인해서 사용
- 백업 탭에서 `.json`으로 내보내기/불러오기

## 저장소 (Firebase, 무료 Spark 플랜)

단어장은 Firebase 프로젝트 `lumos-988e9`의 Firestore(`books`, `units` 컬렉션)에 저장됩니다.
사이트 파일은 https://lumos.naru.pub 에 올려 둡니다(나루 정적 호스팅, 무료).

처음 한 번 설정:
1. Firebase 콘솔 → Firestore Database → **규칙** 탭에 `firestore.rules` 내용을 붙여넣고 게시
2. Authentication → 로그인 방법: **이메일/비밀번호** 사용 설정
3. Authentication → 사용자: 학원 공용 계정 추가
4. Authentication → 설정 → 사용자 작업: **가입(계정 생성) 사용 설정 해제**
   (아무나 계정을 만들어 들어오지 못하게)

## 파일

- `index.html`, `style.css`, `app.js`: 앱
- `spell.js`: 철자 검사·자동완성 (사전 데이터는 jsDelivr에서 불러옴)
- `firestore.rules`: Firestore 보안 규칙 (로그인한 사용자만 읽기/쓰기)
- `lib/html2pdf.bundle.min.js`: PDF 생성 라이브러리 ([html2pdf.js](https://github.com/eKoopmans/html2pdf.js) 0.10.1, MIT)
