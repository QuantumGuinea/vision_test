// ---------------------------
// Supabase 설정 (실제 값으로 대체)
// ---------------------------
const supabaseUrl = "https://pwuuasxrbjfxndcqyaql.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3dXVhc3hyYmpmeG5kY3F5YXFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk0NDYzMjQsImV4cCI6MjA1NTAyMjMyNH0.0XMx7rweHHAbSVbCxLKCU5cm4f5zm2u0sh5i54cbGEg";
const supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);

// ---------------------------
// Supabase에 이미지 업로드 함수
// ---------------------------
async function uploadImageToSupabase(file, folder) {
  const fileName = `${folder}/${Date.now()}_${file.name}`;
  const { data, error } = await supabaseClient.storage
    // .from("my-bucket")
    .from("bucket")
    .upload(fileName, file);
  if (error) {
    throw error;
  }
  const { data: urlData, error: urlError } = supabaseClient.storage
    // .from("my-bucket")
    .from("bucket")
    .getPublicUrl(fileName);
  if (urlError) {
    throw urlError;
  }
  return urlData.publicUrl;
}

// ---------------------------
// API 호출 함수 및 글로벌 재시도 로직
// ---------------------------
const API_URL = "https://gemini-api-calling.glitch.me";

async function callModels(payload) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.warn(`API 요청 실패: ${response.status}`);
      return null;
    }
    const data = await response.json();
    return data; // Glitch 서버가 배열 형태로 반환합니다.
  } catch (error) {
    console.error(`API 호출 중 오류 발생: ${error.message}`);
    return null;
  }
}

async function callModelsWithGlobalRetry(payload, retries = 3, delay = 3000) {
  let result = await callModels(payload);
  if (result) {
    return result;
  } else if (retries > 0) {
    console.warn(
      `모든 모델에서 결과를 받지 못했습니다. ${delay}ms 후 재시도... (남은 재시도: ${retries})`
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    return callModelsWithGlobalRetry(payload, retries - 1, delay * 2);
  }
  return null;
}

// ---------------------------
// 각 모델 응답에서 공통(가장 빈번한) 답변 도출 함수
// ---------------------------
function computeConsensus(results) {
  const consensus = {};
  const keys = [
    "species",
    "size",
    "weight",
    "is_predator",
    "is_allowed_in_public",
  ];
  keys.forEach((key) => {
    const freq = {};
    results.forEach((res) => {
      const value = res[key];
      if (value !== undefined) {
        freq[value] = (freq[value] || 0) + 1;
      }
    });
    let maxCount = 0,
      commonValue = null;
    for (const value in freq) {
      if (freq[value] > maxCount) {
        maxCount = freq[value];
        commonValue = value;
      }
    }
    consensus[key] = commonValue;
  });
  return consensus;
}

// ---------------------------
// JSON 문자열에서 첫 번째 중괄호부터 마지막 중괄호까지 추출하여 파싱하는 함수
// ---------------------------
function robustJSONParse(text) {
  // 정규표현식: 첫번째 {부터 마지막 }까지 추출
  const match = text.match(/{[\s\S]*}/);
  if (match) {
    return JSON.parse(match[0]);
  }
  throw new Error("JSON 추출 실패");
}

// ---------------------------
// DOMContentLoaded 이벤트 처리
// ---------------------------
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("imageInput").addEventListener("change", (event) => {
    const fileInput = event.target;
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const preview = document.getElementById("preview");
      preview.src = URL.createObjectURL(file);
    }
  });

  document
    .getElementById("gemini-button")
    .addEventListener("click", async () => {
      const fileInput = document.getElementById("imageInput");
      const resultDiv = document.getElementById("gemini-result");

      if (!fileInput.files || fileInput.files.length === 0) {
        alert("이미지를 선택해주세요.");
        return;
      }
      const file = fileInput.files[0];
      resultDiv.innerText = "이미지 업로드 중입니다...";

      try {
        const bucketFolder = "supaChaining";
        const imageUrl = await uploadImageToSupabase(file, bucketFolder);
        console.log("업로드된 이미지 URL:", imageUrl);
        resultDiv.innerText = `이미지 업로드 완료!\n\n모델 호출 중입니다...`;

        // 모델에게 보낼 메시지 구성 (JSON 템플릿 형식)
        const messages = [
          {
            role: "user",
            content:
              "다음은 이미지입니다:\n\n" +
              "![](" +
              imageUrl +
              ")\n\n" +
              "이 이미지를 참고하여 해당 동물의 정보를 아래 JSON 형식에 맞춰서 알려주세요:\n\n" +
              "{\n" +
              '  "species": "동물의 종 ",\n' +
              '  "size": "대략적인 크기 ",\n' +
              '  "weight": "대략적인 무게 ",\n' +
              '  "is_predator": "맹수 여부 (예: true/false)",\n' +
              '  "is_allowed_in_public": "공공장소 동행 가능 여부 (예: true/false)"\n' +
              "}",
          },
        ];

        // Glitch 서버는 내부에서 모든 Gemini 모델을 호출하므로, model 속성은 생략합니다.
        const payload = {
          messages,
          maxOutputTokens: 2048,
          temperature: 0.4,
          topP: 1,
          topK: 32,
          // 필요에 따라 다른 파라미터도 추가 가능
        };
        const responses = await callModelsWithGlobalRetry(payload);

        if (!responses || responses.length === 0) {
          resultDiv.innerText = "모든 모델 호출 실패";
          return;
        }

        // 각 모델 응답의 result 필드에서 JSON을 추출하여 파싱
        const individualResults = [];
        const parsedResults = [];
        responses.forEach((res) => {
          try {
            // 응답 결과 문자열에서 JSON 부분만 추출하여 파싱
            const parsed = robustJSONParse(res.result);
            individualResults.push({ model: res.modelUsed, result: parsed });
            parsedResults.push(parsed);
            console.log(`모델 ${res.modelUsed} 응답:`, parsed);
          } catch (e) {
            console.warn(`모델 ${res.modelUsed} 응답 파싱 실패:`, res.result);
          }
        });

        if (parsedResults.length === 0) {
          resultDiv.innerText = "모든 모델의 응답 파싱에 실패했습니다.";
          return;
        }

        const consensus = computeConsensus(parsedResults);
        resultDiv.innerHTML = `
        <h2>모델들의 개별 결과</h2>
        <pre>${JSON.stringify(individualResults, null, 2)}</pre>
        <h2>Consensus 결과</h2>
        <pre>${JSON.stringify(consensus, null, 2)}</pre>
      `;
      } catch (error) {
        console.error("에러 발생:", error);
        resultDiv.innerText = "에러 발생: " + error.message;
      }
    });
});
