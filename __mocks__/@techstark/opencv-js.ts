// __mocks__/@techstark/opencv-js.ts
// OpenCV を使う部分の最小スタブ

class Mat {}
const cv = {
  Mat,
  imshow: () => {},
  matFromImageData: () => new Mat(),
  // 必要に応じて関数を増やしてください
};

export default cv;
