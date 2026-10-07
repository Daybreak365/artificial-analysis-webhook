# Artificial Analysis Intelligence Index -> Discord

Artificial Analysis의 공식 **Download Image** 버튼을 Playwright로 눌러 이미지를 내려받고,
이전 실행의 이미지와 실제 픽셀 내용을 비교해서 **변경됐을 때만** Discord Webhook으로 전송합니다.

## 동작 방식

1. GitHub Actions가 3시간마다 실행됩니다.
2. `https://artificialanalysis.ai/#intelligence`를 엽니다.
3. 지정된 XPath의 Download Image 버튼을 눌러 공식 이미지를 내려받습니다.
4. PNG 파일 자체의 SHA가 아니라 디코딩된 실제 픽셀의 SHA-256을 계산합니다.
   - PNG 압축 방식이나 메타데이터만 달라진 경우에는 업데이트로 보지 않습니다.
5. `.state/last-image.sha256`과 비교합니다.
6. 달라졌을 때만 Discord에 이미지를 올리고 새 해시를 저장소에 커밋합니다.
7. 같으면 아무 메시지도 보내지 않고 종료합니다.

## 설치

### 1. GitHub 저장소 생성

이 폴더의 내용을 GitHub 저장소에 업로드합니다. Private 저장소도 가능합니다.

### 2. Discord Webhook Secret 등록

Repository -> Settings -> Secrets and variables -> Actions -> New repository secret

이름:

`DISCORD_WEBHOOK_URL`

값에는 Discord 채널의 Webhook URL을 넣습니다.

### 3. Actions 쓰기 권한 확인

워크플로가 이전 이미지 해시를 저장하기 위해 저장소에 작은 상태 파일을 커밋합니다.

Repository -> Settings -> Actions -> General -> Workflow permissions 에서
**Read and write permissions**가 허용되어 있어야 합니다.

워크플로 YAML에도 `permissions: contents: write`가 포함되어 있습니다.

### 4. 최초 테스트

Actions -> `Artificial Analysis Intelligence Index Watch` -> Run workflow

첫 실행은 이전 기준값이 없기 때문에 Discord에 한 번 전송되고 `.state/last-image.sha256`이 생성됩니다.

그 직후 다시 `Run workflow`를 눌렀을 때 이미지가 그대로라면 Discord에는 아무것도 올라오지 않아야 정상입니다.

## 확인 주기 변경

현재는 3시간마다 확인합니다.

`.github/workflows/daily.yml`:

```yaml
- cron: '17 */3 * * *'
```

예시:

- 매시간 17분: `17 * * * *`
- 2시간마다: `17 */2 * * *`
- 6시간마다: `17 */6 * * *`

GitHub Actions 스케줄은 UTC 기준이지만, 여기서는 "몇 시간 간격" 확인이라 시차와 무관합니다.

## 다운로드 버튼

현재 1순위 XPath:

`/html/body/main/div[2]/div[2]/div/div/section[1]/div[2]/div[1]/div[1]/div[1]/div[2]/div[1]/button[2]`

해당 XPath가 바뀌면 accessible name 기반 fallback도 시도합니다.

## 참고

다운로드 이미지 자체에 매번 달라지는 시각/랜덤 요소가 실제 픽셀로 포함된다면 매 실행을 업데이트로 인식할 수 있습니다. 그 경우 이미지 전체 대신 차트 데이터나 특정 영역만 비교하도록 변경하는 것이 더 정확합니다.
