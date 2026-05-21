import { ref } from "vue";

const defaultHint = "把光标移到按钮上可以查看该符号或函数的作用说明。";

const buttonHelpTexts = Object.freeze({
  plus: "加法运算符，用于计算左值与右值之和。",
  minus: "减法运算符，用于计算左值减去右值。",
  multiply: "乘法运算符，用于计算两个数或表达式的乘积。",
  divide: "除法运算符，用于计算左值除以右值。",
  power: "幂运算符，a ^ b 表示 a 的 b 次方。",
  lparen: "左括号，用于控制表达式优先级或函数参数范围。",
  rparen: "右括号，用于结束括号表达式或函数参数列表。",
  comma: "逗号，用于分隔函数的多个参数。",
  sin: "正弦函数，sin(x) 为求 x 的正弦值。",
  cos: "余弦函数，cos(x) 为求 x 的余弦值。",
  tan: "正切函数，tan(x) 为求 x 的正切值。",
  sqrt: "平方根函数，sqrt(x) 为求 x 的平方根。",
  exp: "指数函数，exp(x) 表示 e 的 x 次方。",
  ln: "自然对数函数，ln(x) 为求 x 的自然对数。",
  lg: "常用对数函数，lg(x) 为求 x 的以 10 为底的对数。",
  re: "实部函数，re(z) 为求复数 z 的实部。",
  im: "虚部函数，im(z) 为求复数 z 的虚部。",
  abs: "模长函数，abs(z) 为求复数 z 的模。",
  arg: "幅角函数，arg(z) 为求复数 z 的相角。",
  conj: "共轭函数，conj(z) 为求复数 z 的共轭。",
  rect: "直角坐标构造函数，rect(x, y) 表示 x + y*i。",
  polar: "相量构造函数，polar(r, theta, unit) 按模值、角度和角度单位生成复数；unit 一般填写 deg 或 rad。",
  to_rect: "转换函数，to_rect(z) 将结果按直角坐标形式显示。",
  to_polar: "转换函数，to_polar(z) 将结果按相量形式显示。",
  pi: "圆周率 π，约为 3.141592653589793。",
  e: "自然常数 e，约为 2.718281828459045。",
  i: "虚数单位，满足 i^2 = -1；j 也可作为虚数单位，但同一条表达式中不能与 i 混用，且 i、j 不能直接跟在数字后面，需写成 3*i、3*j。",
  deg: "角度单位常量，表示 degree（度）。",
  rad: "角度单位常量，表示 radian（弧度）。",
  backspace: "退格，删除光标前的一个字符。",
  clear: "清空，删除当前输入框中的全部内容。",
});

export function useButtonHints() {
  const buttonHint = ref(defaultHint);

  function getButtonHelpText(key) {
    return buttonHelpTexts[key] || defaultHint;
  }

  function showButtonHint(key) {
    buttonHint.value = getButtonHelpText(key);
  }

  function resetButtonHint() {
    buttonHint.value = defaultHint;
  }

  return {
    buttonHelpTexts,
    buttonHint,
    defaultHint,
    getButtonHelpText,
    resetButtonHint,
    showButtonHint,
  };
}
