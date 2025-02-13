document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("image-input").addEventListener("change", (event) => {
    const fileInput = event.target;
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = function (e) {
        document.getElementById("preview").src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  const API_URL = "https://toothsome-western-ermine.glitch.me";

  async function callModels(payload) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.warn(`API 요청 실패: ${response.status}`);
        return null;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`API 호출 중 오류 발생: ${error.message}`);
      return null;
    }
  }

  // 글로벌 재시도 로직: 모델 다중 호출 이후에 재시도
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

  // Gemini 모델 다중 호출 실행 버튼 이벤트
  document
    .getElementById("gemini-button")
    .addEventListener("click", async () => {
      const fileInput = document.getElementById("image-input");
      if (!fileInput.files || fileInput.files.length === 0) {
        alert("이미지를 선택해주세요.");
        return;
      }
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = async function () {
        // data URL에서 base64 데이터 추출
        const base64Data = reader.result.split(",")[1];
        // 요청 페이로드 구성
        // 프롬프트: "이 이미지에 있는 동물이 무엇이며, 그 동물의 종(종류)이 무엇인지 알려주세요."
        const payload = {
          model: "", // 이후 각 모델로 설정됨.
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "이 이미지에 있는 동물이 무엇이며, 그 동물의 종(종류)이 무엇인지 알려주세요.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${file.type};base64,${base64Data}`,
                  },
                },
              ],
            },
          ],
        };

        // 글로벌 재시도 로직을 통해 모델 호출
        const resultObj = await callModelsWithGlobalRetry(payload);
        if (resultObj) {
          document.getElementById(
            "gemini-result"
          ).innerText = `모델 ${resultObj.modelUsed} 사용 결과:\n\n${resultObj.result}`;
        } else {
          document.getElementById("gemini-result").innerText =
            "모든 모델에서 결과를 받아오지 못했습니다.";
        }
      };
      reader.readAsDataURL(file);
    });
});
