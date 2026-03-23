import React, { useState, useEffect, useRef, useCallback } from 'react';

const VedicMathApp = () => {
  const [denominator, setDenominator] = useState(19);
  const [ekadhika, setEkadhika] = useState(2);
  const [steps, setSteps] = useState([]);
  const [result, setResult] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showSymmetry, setShowSymmetry] = useState(false);
  const [error, setError] = useState('');
  const [speed, setSpeed] = useState(1500); // 기본 속도 더 느리게
  const [showCelebration, setShowCelebration] = useState(false);
  const [confetti, setConfetti] = useState([]);
  const [celebrationTriggered, setCelebrationTriggered] = useState(false);
  const [copyNotification, setCopyNotification] = useState('');
  const stepsContainerRef = useRef(null);
  const intervalRef = useRef(null);

  // 로고 SVG - 골드/앰버 색상으로 변경
  const LogoSVG = ({ size = 80 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 80 80" style={{
      filter: 'drop-shadow(0 0 15px rgba(212, 165, 116, 0.6)) drop-shadow(0 0 30px rgba(184, 149, 106, 0.4))',
      animation: 'logoGlow 3s ease-in-out infinite'
    }}>
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{stopColor:'#d4a574'}}/>
          <stop offset="50%" style={{stopColor:'#c9956a'}}/>
          <stop offset="100%" style={{stopColor:'#a67c52'}}/>
        </linearGradient>
        <path id="topArcInner" d="M 13,40 A 27,27 0 0,1 67,40"/>
        <path id="bottomArcOuter" d="M 8,40 A 32,32 0 0,0 72,40"/>
      </defs>
      <circle cx="40" cy="40" r="38" fill="url(#logoGrad)" stroke="#8b6914" strokeWidth="2"/>
      <text fontFamily="Arial, sans-serif" fontSize="8.5" fontWeight="700" fill="#1a1a2e" letterSpacing="0.3">
        <textPath href="#topArcInner" startOffset="50%" textAnchor="middle">NAEMANG2943</textPath>
      </text>
      <text x="40" y="36" fontSize="18" textAnchor="middle" fill="#1a1a2e"
            fontFamily="'Noto Sans KR', sans-serif" fontWeight="900" stroke="#1a1a2e" strokeWidth="0.5">ㅇ</text>
      <text x="40" y="47" fontSize="18" textAnchor="middle" fill="#1a1a2e"
            fontFamily="'Noto Sans KR', sans-serif" fontWeight="900" stroke="#1a1a2e" strokeWidth="0.5">ㅡ</text>
      <text x="40" y="58" fontSize="18" textAnchor="middle" fill="#1a1a2e"
            fontFamily="'Noto Sans KR', sans-serif" fontWeight="900" stroke="#1a1a2e" strokeWidth="0.5">ㄴ</text>
      <text fontFamily="Arial, sans-serif" fontSize="8.5" fontWeight="700" fill="#1a1a2e" letterSpacing="0.5">
        <textPath href="#bottomArcOuter" startOffset="50%" textAnchor="middle">SJL0108</textPath>
      </text>
    </svg>
  );

  // 에카디카 계산
  const calculateEkadhika = (denom) => {
    if (denom % 10 !== 9) return null;
    return Math.floor(denom / 10) + 1;
  };

  // 순환 마디 계산 (역순 방식)
  const calculateRepeatingDecimal = (denom) => {
    const eka = calculateEkadhika(denom);
    if (!eka) return { steps: [], result: '' };

    const calculationSteps = [];
    let digits = [];
    let carry = 0;
    let current = 1;
    const maxSteps = denom - 1;

    for (let i = 0; i < maxSteps; i++) {
      const product = current * eka + carry;
      const digit = product % 10;
      carry = Math.floor(product / 10);
      
      calculationSteps.push({
        step: i + 1,
        current,
        multiplier: eka,
        prevCarry: i === 0 ? 0 : calculationSteps[i-1]?.carry || 0,
        product: current * eka,
        productWithCarry: product,
        digit,
        carry,
        partialResult: digit + digits.join('')
      });
      
      digits.unshift(digit);
      current = digit;

      if (i > 0 && digit === 1 && carry === 0) {
        break;
      }
    }

    return {
      steps: calculationSteps,
      result: digits.join('')
    };
  };

  // 대칭성 확인
  const checkSymmetry = (resultStr) => {
    if (resultStr.length % 2 !== 0) return null;
    const half = resultStr.length / 2;
    const first = resultStr.slice(0, half);
    const second = resultStr.slice(half);
    
    let sum = '';
    let carry = 0;
    for (let i = half - 1; i >= 0; i--) {
      const s = parseInt(first[i]) + parseInt(second[i]) + carry;
      sum = (s % 10) + sum;
      carry = Math.floor(s / 10);
    }
    if (carry) sum = carry + sum;
    
    return { first, second, sum, isNines: /^9+$/.test(sum) };
  };

  // 알림 표시
  const showNotification = (message) => {
    setCopyNotification(message);
    setTimeout(() => setCopyNotification(''), 2500);
  };

  // 계산 과정 텍스트 생성
  const generateStepsText = useCallback(() => {
    if (steps.length === 0) return '계산 과정이 없습니다. / No calculation steps.';
    
    let text = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `  에카디카 나눗셈기 / Ekadhika Division Calculator\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `▶ 계산: 1/${denominator}  (매개수/Ekadhika: ${ekadhika})\n\n`;
    text += `──────────────────────────────────────────────────\n`;
    text += `  역순 계산 과정 / Reverse Calculation Steps\n`;
    text += `──────────────────────────────────────────────────\n\n`;
    
    steps.forEach(step => {
      const carryText = step.prevCarry > 0 ? ` + ${step.prevCarry}` : '';
      const newCarryText = step.carry > 0 ? `  (올림/Carry: +${step.carry})` : '';
      text += `  #${String(step.step).padStart(2, '0')}: ${step.current} × ${step.multiplier}${carryText} = ${step.productWithCarry}`;
      text += `  → 숫자: ${step.digit}${newCarryText}\n`;
      text += `        결과: ${step.partialResult}\n\n`;
    });
    
    text += `──────────────────────────────────────────────────\n`;
    text += `  최종 결과 / Final Result\n`;
    text += `──────────────────────────────────────────────────\n\n`;
    text += `  1/${denominator} = 0.${result}\n`;
    text += `  순환 마디 길이 / Cycle Length: ${result.length}자리 / ${result.length} digits\n\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `  Generated by 에카디카 나눗셈기 | वैदिक गणित\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    return text;
  }, [steps, denominator, ekadhika, result]);

  // 새 탭에서 열기
  const openInNewTab = () => {
    if (steps.length === 0 || !result) {
      showNotification('⚠️ 먼저 계산을 실행하세요 / Run calculation first');
      return;
    }
    
    const stepsHtml = steps.map(step => {
      const carryText = step.prevCarry > 0 ? ` <span style="color:#ff6b6b;font-weight:bold">+</span> <span style="color:#7a9e7a">${step.prevCarry}</span>` : '';
      const newCarryText = step.carry > 0 ? ` <span style="color:#7a9e7a">(올림: <span style="color:#ff6b6b">+</span>${step.carry})</span>` : '';
      return `<div style="padding:10px;margin:5px 0;background:#16213e;border-radius:6px;border-left:3px solid #d4a574;">
        <span style="color:#8b7355">#${step.step}</span>: 
        <span style="color:#a89880">${step.current}</span> × 
        <span style="color:#d4a574">${step.multiplier}</span>${carryText} = 
        <span style="color:#f4d9a0;font-weight:bold">${step.productWithCarry}</span>
        → 숫자: <span style="color:#f4d9a0">${step.digit}</span>${newCarryText}
        → <span style="color:#d4a574">${step.partialResult}</span>
      </div>`;
    }).join('');

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>에카디카 나눗셈기 - 1/${denominator}</title>
  <meta charset="UTF-8">
  <style>
    body { margin:0; padding:30px; background:#1a1a2e; color:#e8d5b7; font-family:'Noto Sans KR',sans-serif; }
    h1 { color:#f4d9a0; font-weight:600; }
    h2 { color:#d4a574; margin-top:30px; border-bottom:1px solid #2a3a5e; padding-bottom:10px; }
    .result-box { font-family:monospace; font-size:20px; color:#f4d9a0; background:#16213e; padding:20px; border-radius:8px; text-decoration:overline; letter-spacing:2px; word-break:break-all; }
    .info { color:#a89880; margin:10px 0; }
  </style>
</head>
<body>
  <h1>에카디카 나눗셈기 / Ekadhika Division Calculator</h1>
  <p class="info">베다 수학의 비법으로 계산한 1/${denominator}의 순환소수</p>
  <p class="info">매개수 / Ekadhika: <strong style="color:#f4d9a0;font-size:20px">${ekadhika}</strong></p>
  
  <h2>📊 결과 / Result</h2>
  <div class="result-box">${result}</div>
  <p class="info">순환 마디 길이 / Cycle Length: ${result.length}자리</p>
  
  <h2>📝 역순 계산 과정 / Reverse Calculation Steps</h2>
  ${stepsHtml}
  
  <p style="margin-top:40px;color:#6b5b4f;font-size:12px;text-align:center;">
    Generated by 에카디카 나눗셈기 | वैदिक गणित • Vedic Mathematics
  </p>
</body>
</html>`;

    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(htmlContent);
      newWindow.document.close();
      showNotification('🔗 새 탭에서 열림 / Opened in new tab!');
    }
  };

  // 저장 (HTML 파일로)
  const saveAsFile = () => {
    if (steps.length === 0 || !result) {
      showNotification('⚠️ 먼저 계산을 실행하세요 / Run calculation first');
      return;
    }

    const content = `<!DOCTYPE html>
<html>
<head>
  <title>에카디카 나눗셈기 결과 - 1/${denominator}</title>
  <meta charset="UTF-8">
  <style>
    body { margin:0; padding:30px; background:#1a1a2e; color:#e8d5b7; font-family:'Noto Sans KR',sans-serif; }
    h1 { color:#f4d9a0; }
    h2 { color:#d4a574; margin-top:30px; }
    .result { font-family:monospace; font-size:20px; color:#f4d9a0; background:#16213e; padding:15px; border-radius:8px; }
    .steps { background:#16213e; padding:15px; border-radius:8px; }
    .step { padding:8px 0; border-bottom:1px solid #2a3a5e; font-family:monospace; }
    .carry { color:#7a9e7a; }
    .plus { color:#ff6b6b; font-weight:bold; }
    .digit { color:#f4d9a0; font-weight:bold; }
  </style>
</head>
<body>
  <h1>에카디카 나눗셈기 / Ekadhika Division Calculator</h1>
  <p>베다 수학의 비법으로 계산한 1/${denominator}의 순환소수</p>
  
  <h2>📊 결과 / Result</h2>
  <div class="result">
    <p>1/${denominator} = 0.<span style="text-decoration:overline">${result}</span></p>
    <p>순환 마디 길이 / Cycle Length: ${result.length}자리</p>
    <p>매개수 / Ekadhika: ${ekadhika}</p>
  </div>
  
  <h2>📝 역순 계산 과정 / Reverse Calculation Steps</h2>
  <div class="steps">
${steps.map(step => `    <div class="step">
      #${step.step}: ${step.current} × ${step.multiplier}${step.prevCarry > 0 ? ` <span class="plus">+</span> <span class="carry">${step.prevCarry}</span>` : ''} = ${step.productWithCarry} 
      → 숫자: <span class="digit">${step.digit}</span>${step.carry > 0 ? ` <span class="carry">(올림: <span class="plus">+</span>${step.carry})</span>` : ''} 
      → ${step.partialResult}
    </div>`).join('\n')}
  </div>
  
  <p style="margin-top:30px;color:#6b5b4f;font-size:12px;">
    Generated by 에카디카 나눗셈기 | वैदिक गणित • Vedic Mathematics
  </p>
</body>
</html>`;

    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ekadhika_1_${denominator}_result.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('💾 파일 저장됨 / File saved!');
  };

  // 코드 복사
  const copyCode = async () => {
    const codeSnippet = `// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 에카디카 나눗셈 알고리즘 / Ekadhika Division Algorithm
// 베다 수학 - 1/n (n이 9로 끝나는 경우) 순환소수 계산
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function calculateEkadhika(denominator) {
  // 분모가 9로 끝나지 않으면 null 반환
  if (denominator % 10 !== 9) return null;
  // 매개수 = (분모 + 1) / 10
  return Math.floor(denominator / 10) + 1;
}

function calculateRepeatingDecimal(denominator) {
  const ekadhika = calculateEkadhika(denominator);
  if (!ekadhika) return null;
  
  let digits = [];
  let carry = 0;
  let current = 1; // 항상 1부터 시작
  
  // 최대 (분모 - 1) 단계까지 계산
  for (let i = 0; i < denominator - 1; i++) {
    const product = current * ekadhika + carry;
    const digit = product % 10;      // 1의 자리 = 새 숫자
    carry = Math.floor(product / 10); // 10의 자리 = 올림
    
    digits.unshift(digit); // 앞에 추가 (역순)
    current = digit;       // 다음 계산에 사용
    
    // 순환 완료 체크: 1이 나오고 올림이 없으면 종료
    if (i > 0 && digit === 1 && carry === 0) break;
  }
  
  return digits.join('');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 예시 실행 / Example
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const denom = ${denominator};
const ekadhika = calculateEkadhika(denom);
const result = calculateRepeatingDecimal(denom);

console.log(\`1/\${denom}의 매개수: \${ekadhika}\`);
console.log(\`1/\${denom} = 0.\${result}\`);
console.log(\`순환 마디 길이: \${result.length}자리\`);

// 출력:
// 1/${denominator}의 매개수: ${ekadhika}
// 1/${denominator} = 0.${result || '(계산 필요)'}
// 순환 마디 길이: ${result ? result.length : '?'}자리
`;

    try {
      await navigator.clipboard.writeText(codeSnippet);
      showNotification('📋 코드 복사됨 / Code copied!');
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = codeSnippet;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showNotification('📋 코드 복사됨 / Code copied!');
    }
  };

  // 화면 복사 (결과 + 계산 과정)
  const copyScreen = async () => {
    if (steps.length === 0 || !result) {
      showNotification('⚠️ 먼저 계산을 실행하세요 / Run calculation first');
      return;
    }
    
    const text = generateStepsText();
    
    try {
      await navigator.clipboard.writeText(text);
      showNotification('📄 화면 복사됨 / Screen copied!');
    } catch (err) {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showNotification('📄 화면 복사됨 / Screen copied!');
    }
  };

  // 팡파레 효과
  const triggerCelebration = useCallback(() => {
    if (celebrationTriggered) return;
    
    setCelebrationTriggered(true);
    setShowCelebration(true);
    
    const colors = ['#f4d9a0', '#d4a574', '#667eea', '#764ba2', '#7a9e7a', '#e8b478'];
    const newConfetti = [];
    for (let i = 0; i < 100; i++) {
      newConfetti.push({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 2,
        duration: 2 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 6 + Math.random() * 8,
        rotation: Math.random() * 360
      });
    }
    setConfetti(newConfetti);

    setTimeout(() => {
      setConfetti([]);
    }, 5000);
  }, [celebrationTriggered]);

  // 축하 화면 닫기
  const closeCelebration = () => {
    setShowCelebration(false);
  };

  // 계산 준비
  const prepareCalculation = () => {
    const eka = calculateEkadhika(denominator);
    if (!eka) {
      setError('분모는 9로 끝나는 숫자여야 합니다 (예: 19, 29, 49...)');
      return false;
    }
    
    setError('');
    setEkadhika(eka);
    setShowCelebration(false);
    setCelebrationTriggered(false);
    
    const { steps: newSteps, result: newResult } = calculateRepeatingDecimal(denominator);
    setSteps(newSteps);
    setResult(newResult);
    setCurrentStep(-1);
    
    return true;
  };

  // 재생
  const play = () => {
    if (steps.length === 0) {
      if (!prepareCalculation()) return;
    }
    setIsPlaying(true);
  };

  // 정지
  const pause = () => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  };

  // 다음 단계
  const nextStep = () => {
    if (steps.length === 0) {
      if (!prepareCalculation()) return;
    }
    if (currentStep < steps.length - 1) {
      const newStep = currentStep + 1;
      setCurrentStep(newStep);
      if (newStep === steps.length - 1) {
        triggerCelebration();
      }
    }
  };

  // 이전 단계
  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  // 리셋
  const reset = () => {
    pause();
    setCurrentStep(-1);
    setShowCelebration(false);
    setCelebrationTriggered(false);
  };

  // 자동 재생
  useEffect(() => {
    if (isPlaying && steps.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false);
            triggerCelebration();
            return prev;
          }
          return prev + 1;
        });
      }, speed);
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, steps.length, speed, triggerCelebration]);

  // 스크롤 자동 이동
  useEffect(() => {
    if (stepsContainerRef.current && currentStep >= 0) {
      const container = stepsContainerRef.current;
      const stepElement = container.children[currentStep];
      if (stepElement) {
        stepElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentStep]);

  const symmetryData = result ? checkSymmetry(result) : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      fontFamily: "'Noto Sans KR', 'Crimson Pro', serif",
      color: '#e8d5b7',
      padding: 'clamp(12px, 3vw, 20px)',
      boxSizing: 'border-box',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 복사 알림 */}
      {copyNotification && (
        <div style={{
          position: 'fixed',
          top: 'clamp(10px, 2vw, 20px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: copyNotification.includes('⚠️') 
            ? 'rgba(220, 100, 100, 0.95)' 
            : 'rgba(122, 158, 122, 0.95)',
          color: '#fff',
          padding: 'clamp(10px, 2vw, 12px) clamp(16px, 4vw, 24px)',
          borderRadius: '8px',
          fontSize: 'clamp(12px, 3vw, 14px)',
          fontWeight: '500',
          zIndex: 1001,
          animation: 'fadeIn 0.3s ease',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          maxWidth: '90vw',
          textAlign: 'center'
        }}>
          {copyNotification}
        </div>
      )}

      {/* Confetti */}
      {confetti.map(c => (
        <div
          key={c.id}
          style={{
            position: 'fixed',
            left: `${c.x}%`,
            top: '-20px',
            width: `${c.size}px`,
            height: `${c.size}px`,
            background: c.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            transform: `rotate(${c.rotation}deg)`,
            animation: `confettiFall ${c.duration}s linear ${c.delay}s forwards`,
            pointerEvents: 'none',
            zIndex: 1000
          }}
        />
      ))}

      {/* 축하 오버레이 */}
      {showCelebration && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          animation: 'fadeIn 0.5s ease',
          padding: '20px'
        }}>
          <div style={{
            textAlign: 'center',
            animation: 'celebrationPop 0.5s ease',
            maxWidth: '90vw'
          }}>
            <div style={{ fontSize: 'clamp(50px, 15vw, 80px)', marginBottom: '20px' }}>🎉</div>
            <h2 style={{
              fontSize: 'clamp(22px, 6vw, 36px)',
              fontWeight: '300',
              color: '#f4d9a0',
              margin: '0 0 10px 0',
              textShadow: '0 0 30px rgba(244, 217, 160, 0.5)'
            }}>
              계산 완료!
            </h2>
            <p style={{
              fontSize: 'clamp(14px, 4vw, 20px)',
              color: '#d4a574',
              margin: 0
            }}>
              1/{denominator}의 순환마디 {result.length}자리를 찾았습니다!
            </p>
            <p style={{
              fontSize: 'clamp(12px, 3vw, 16px)',
              color: '#a89880',
              marginTop: '8px'
            }}>
              Found {result.length}-digit repeating cycle!
            </p>
            <button
              onClick={closeCelebration}
              style={{
                marginTop: '24px',
                background: 'linear-gradient(135deg, #d4a574, #b8956a)',
                border: 'none',
                borderRadius: '8px',
                padding: 'clamp(10px, 2vw, 12px) clamp(24px, 5vw, 32px)',
                fontSize: 'clamp(14px, 3vw, 16px)',
                color: '#1a1a2e',
                cursor: 'pointer',
                minHeight: '44px'
              }}
            >
              결과 보기 / View Result
            </button>
          </div>
        </div>
      )}

      {/* 배경 장식 */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
          radial-gradient(circle at 20% 80%, rgba(212, 165, 116, 0.08) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(184, 149, 106, 0.08) 0%, transparent 50%)
        `,
        pointerEvents: 'none'
      }} />

      <div style={{ maxWidth: '900px', margin: '0 auto', position: 'relative' }}>
        {/* 툴바 - 모바일 반응형 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '8px',
          marginBottom: '20px'
        }}>
          <button 
            onClick={openInNewTab} 
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(232, 180, 120, 0.3)',
              borderRadius: '8px',
              padding: '12px 10px',
              fontSize: '12px',
              color: '#d4a574',
              cursor: 'pointer',
              transition: 'all 0.3s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              minHeight: '44px'
            }}
          >
            🔗 새 탭 / New Tab
          </button>
          <button 
            onClick={saveAsFile} 
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(232, 180, 120, 0.3)',
              borderRadius: '8px',
              padding: '12px 10px',
              fontSize: '12px',
              color: '#d4a574',
              cursor: 'pointer',
              transition: 'all 0.3s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              minHeight: '44px'
            }}
          >
            💾 저장 / Save
          </button>
          <button 
            onClick={copyCode} 
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(232, 180, 120, 0.3)',
              borderRadius: '8px',
              padding: '12px 10px',
              fontSize: '12px',
              color: '#d4a574',
              cursor: 'pointer',
              transition: 'all 0.3s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              minHeight: '44px'
            }}
          >
            📋 코드복사 / Code
          </button>
          <button 
            onClick={copyScreen} 
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(232, 180, 120, 0.3)',
              borderRadius: '8px',
              padding: '12px 10px',
              fontSize: '12px',
              color: '#d4a574',
              cursor: 'pointer',
              transition: 'all 0.3s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              minHeight: '44px'
            }}
          >
            📄 화면복사 / Copy
          </button>
        </div>

        {/* 헤더 - 로고와 타이틀을 나란히 배치 */}
        <header style={{ 
          textAlign: 'center', 
          marginBottom: '40px'
        }}>
          {/* 로고 + 타이틀 한 줄 배치 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'clamp(12px, 3vw, 24px)',
            marginBottom: '16px',
            flexWrap: 'wrap'
          }}>
            <div className="logo-container">
              <LogoSVG size={80} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{
                fontSize: '12px',
                letterSpacing: '6px',
                color: '#d4a574',
                marginBottom: '8px',
                textTransform: 'uppercase'
              }}>
                वैदिक गणित • Vedic Mathematics
              </div>
              <h1 style={{
                fontSize: 'clamp(26px, 5vw, 42px)',
                fontWeight: '700',
                margin: '0 0 4px 0',
                background: 'linear-gradient(90deg, #f4d9a0, #e8b478, #f4d9a0)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textShadow: 'none'
              }}>
                에카디카 나눗셈기
              </h1>
              <h2 style={{
                fontSize: 'clamp(14px, 3vw, 20px)',
                fontWeight: '400',
                margin: 0,
                color: '#b8956a'
              }}>
                Ekadhika Division Calculator
              </h2>
            </div>
          </div>
          
          <p style={{
            fontSize: '14px',
            color: '#a89880',
            margin: 0,
            fontStyle: 'italic'
          }}>
            베다 수학의 비법으로 순환소수를 계산합니다<br/>
            <span style={{ fontSize: '12px' }}>Calculate repeating decimals using Vedic Mathematics</span>
          </p>
        </header>

        {/* 입력 섹션 */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '16px',
          padding: 'clamp(16px, 4vw, 28px)',
          marginBottom: '24px',
          border: '1px solid rgba(232, 180, 120, 0.15)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'clamp(8px, 2vw, 20px)',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 1.5vw, 12px)' }}>
              <span style={{ fontSize: 'clamp(32px, 8vw, 48px)', fontWeight: '200', color: '#d4a574' }}>1</span>
              <span style={{ fontSize: 'clamp(32px, 8vw, 48px)', fontWeight: '200', color: '#8b7355' }}>/</span>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                value={denominator}
                onChange={(e) => {
                  setDenominator(parseInt(e.target.value) || 0);
                  setSteps([]);
                  setCurrentStep(-1);
                  setCelebrationTriggered(false);
                }}
                style={{
                  width: 'clamp(80px, 20vw, 100px)',
                  fontSize: 'clamp(24px, 6vw, 36px)',
                  fontWeight: '300',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '2px solid rgba(232, 180, 120, 0.3)',
                  borderRadius: '8px',
                  color: '#f4d9a0',
                  padding: 'clamp(6px, 1.5vw, 8px) clamp(8px, 2vw, 16px)',
                  textAlign: 'center',
                  outline: 'none',
                  transition: 'border-color 0.3s',
                  minHeight: '44px'
                }}
              />
            </div>
          </div>
          
          {error && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              background: 'rgba(220, 100, 100, 0.15)',
              borderRadius: '8px',
              color: '#e8a0a0',
              textAlign: 'center',
              fontSize: '14px'
            }}>
              ⚠️ {error}<br/>
              <span style={{ fontSize: '12px' }}>Denominator must end with 9 (e.g., 19, 29, 49...)</span>
            </div>
          )}

          {calculateEkadhika(denominator) && !error && (
            <div style={{
              marginTop: '20px',
              textAlign: 'center',
              padding: '16px',
              background: 'rgba(232, 180, 120, 0.08)',
              borderRadius: '8px'
            }}>
              <span style={{ color: '#a89880' }}>매개수 / Ekadhika: </span>
              <span style={{ 
                fontSize: '24px', 
                fontWeight: '600', 
                color: '#f4d9a0',
                marginLeft: '8px'
              }}>
                {calculateEkadhika(denominator)}
              </span>
              <div style={{ fontSize: '13px', color: '#8b7355', marginTop: '6px' }}>
                {denominator} = 10 × {(denominator + 1) / 10} - 1 → Ekadhika = {(denominator + 1) / 10}
              </div>
            </div>
          )}

          {/* 컨트롤러 */}
          <div style={{
            marginTop: '24px',
            padding: '20px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '12px'
          }}>
            {/* 속도 조절 - 더 느린 범위 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              marginBottom: '20px',
              flexWrap: 'wrap'
            }}>
              <span style={{ fontSize: '13px', color: '#a89880' }}>
                🐢 느림 / Slow
              </span>
              <input
                type="range"
                min="200"
                max="3000"
                step="200"
                value={3200 - speed}
                onChange={(e) => setSpeed(3200 - parseInt(e.target.value))}
                style={{
                  width: '150px',
                  accentColor: '#d4a574'
                }}
              />
              <span style={{ fontSize: '13px', color: '#a89880' }}>
                🐇 빠름 / Fast
              </span>
              <span style={{
                fontSize: '12px',
                color: '#8b7355',
                padding: '4px 8px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '4px',
                minWidth: '60px',
                textAlign: 'center'
              }}>
                {(speed / 1000).toFixed(1)}초
              </span>
            </div>

            {/* 재생 컨트롤 버튼 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'clamp(6px, 1.5vw, 12px)',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={reset}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(232, 180, 120, 0.3)',
                  borderRadius: '8px',
                  padding: 'clamp(10px, 2vw, 12px) clamp(12px, 3vw, 20px)',
                  fontSize: 'clamp(12px, 2.5vw, 14px)',
                  color: '#d4a574',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  minHeight: '44px',
                  whiteSpace: 'nowrap'
                }}
              >
                ⏮ 처음
              </button>
              
              <button
                onClick={prevStep}
                disabled={currentStep <= 0}
                style={{
                  background: currentStep <= 0 ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(232, 180, 120, 0.3)',
                  borderRadius: '8px',
                  padding: 'clamp(10px, 2vw, 12px) clamp(12px, 3vw, 20px)',
                  fontSize: 'clamp(12px, 2.5vw, 14px)',
                  color: currentStep <= 0 ? '#6b5b4f' : '#d4a574',
                  cursor: currentStep <= 0 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  minHeight: '44px',
                  whiteSpace: 'nowrap'
                }}
              >
                ⏪ 이전
              </button>

              <button
                onClick={isPlaying ? pause : play}
                style={{
                  background: 'linear-gradient(135deg, #d4a574, #b8956a)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: 'clamp(12px, 2.5vw, 14px) clamp(20px, 5vw, 32px)',
                  fontSize: 'clamp(14px, 3vw, 16px)',
                  fontWeight: '500',
                  color: '#1a1a2e',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  boxShadow: '0 4px 20px rgba(212, 165, 116, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  minHeight: '48px',
                  whiteSpace: 'nowrap'
                }}
              >
                {isPlaying ? '⏸ 정지' : '▶ 재생'}
              </button>

              <button
                onClick={nextStep}
                disabled={currentStep >= steps.length - 1 && steps.length > 0}
                style={{
                  background: (currentStep >= steps.length - 1 && steps.length > 0) 
                    ? 'rgba(255, 255, 255, 0.03)' 
                    : 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(232, 180, 120, 0.3)',
                  borderRadius: '8px',
                  padding: 'clamp(10px, 2vw, 12px) clamp(12px, 3vw, 20px)',
                  fontSize: 'clamp(12px, 2.5vw, 14px)',
                  color: (currentStep >= steps.length - 1 && steps.length > 0) ? '#6b5b4f' : '#d4a574',
                  cursor: (currentStep >= steps.length - 1 && steps.length > 0) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  minHeight: '44px',
                  whiteSpace: 'nowrap'
                }}
              >
                다음 ⏩
              </button>
            </div>
          </div>
        </div>

        {/* 라이브 계산 뷰 */}
        {steps.length > 0 && currentStep >= 0 && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '16px',
            padding: '28px',
            marginBottom: '24px',
            border: '1px solid rgba(232, 180, 120, 0.15)'
          }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: '400',
              color: '#d4a574',
              marginTop: 0,
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '20px' }}>✨</span>
              라이브 계산 / Live Calculation
            </h2>

            {/* 현재 계산식 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'clamp(6px, 2vw, 12px)',
              marginBottom: '24px',
              fontSize: 'clamp(18px, 5vw, 28px)',
              fontFamily: "'Fira Code', monospace",
              flexWrap: 'wrap'
            }}>
              <span style={{ color: '#f4d9a0' }}>
                {steps[currentStep]?.current}
              </span>
              <span style={{ color: '#6b5b4f' }}>×</span>
              <span style={{ color: '#d4a574' }}>{ekadhika}</span>
              {steps[currentStep]?.prevCarry > 0 && (
                <>
                  <span style={{ color: '#ff6b6b', fontWeight: 'bold' }}>+</span>
                  <span style={{ 
                    color: '#7a9e7a',
                    animation: 'carryAbsorb 0.5s ease'
                  }}>
                    {steps[currentStep]?.prevCarry}
                  </span>
                </>
              )}
              <span style={{ color: '#6b5b4f' }}>=</span>
              <span style={{ 
                color: '#f4d9a0', 
                fontWeight: '600',
                animation: 'popIn 0.3s ease'
              }}>
                {steps[currentStep]?.productWithCarry}
              </span>
            </div>

            {/* 숫자 쌓이는 시각화 */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
              minHeight: '80px',
              padding: 'clamp(20px, 4vw, 30px) clamp(12px, 3vw, 20px) clamp(12px, 3vw, 20px)',
              background: 'rgba(0, 0, 0, 0.25)',
              borderRadius: '12px',
              position: 'relative',
              overflowX: 'auto',
              overflowY: 'visible',
              WebkitOverflowScrolling: 'touch'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                position: 'relative',
                minWidth: 'min-content',
                margin: '0 auto'
              }}>
                {/* 새로 추가되는 숫자 + 위첨자 올림 */}
                <div 
                  key={`digit-container-${currentStep}`}
                  style={{ 
                    position: 'relative', 
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                  }}
                >
                  {/* 받아올림 위첨자 + 빨간 '+' */}
                  {steps[currentStep]?.carry > 0 && (
                    <span
                      key={`carry-${currentStep}`}
                      style={{
                        position: 'absolute',
                        top: '-28px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: '18px',
                        fontFamily: "'Fira Code', monospace",
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        animation: 'carryAppear 0.4s ease forwards',
                        zIndex: 10
                      }}
                    >
                      <span style={{ 
                        color: '#ff6b6b', 
                        fontWeight: '900',
                        textShadow: '0 0 10px rgba(255, 107, 107, 0.8)'
                      }}>+</span>
                      <span style={{ 
                        color: '#7a9e7a',
                        textShadow: '0 0 15px rgba(122, 200, 122, 0.8)'
                      }}>{steps[currentStep]?.carry}</span>
                    </span>
                  )}
                  
                  {/* 현재 숫자 */}
                  <span
                    style={{
                      fontSize: 'clamp(28px, 5vw, 48px)',
                      fontFamily: "'Fira Code', monospace",
                      fontWeight: '600',
                      color: '#f4d9a0',
                      textShadow: '0 0 20px rgba(244, 217, 160, 0.5)',
                      animation: 'digitSlideIn 0.3s ease',
                      marginRight: '2px',
                      flexShrink: 0
                    }}
                  >
                    {steps[currentStep]?.digit}
                  </span>
                </div>
                
                {/* 이미 쌓인 숫자들 */}
                {steps.slice(0, currentStep).reverse().map((step, idx) => (
                  <div 
                    key={`prev-container-${idx}`}
                    style={{ 
                      position: 'relative', 
                      display: 'inline-flex',
                      flexDirection: 'column',
                      alignItems: 'center'
                    }}
                  >
                    {/* 이전 올림 표시 (사라지는 애니메이션) */}
                    {idx === 0 && steps[currentStep]?.prevCarry > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '-28px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          fontSize: '16px',
                          fontFamily: "'Fira Code', monospace",
                          fontWeight: '700',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          animation: 'carryDisappear 0.4s ease forwards'
                        }}
                      >
                        <span style={{ color: '#ff6b6b', opacity: 0.5 }}>+</span>
                        <span style={{ color: '#7a9e7a', opacity: 0.5 }}>{steps[currentStep]?.prevCarry}</span>
                      </span>
                    )}
                    
                    <span
                      style={{
                        fontSize: 'clamp(28px, 5vw, 48px)',
                        fontFamily: "'Fira Code', monospace",
                        fontWeight: '400',
                        color: idx === 0 ? '#d4a574' : '#a89880',
                        opacity: Math.max(0.4, 1 - idx * 0.03),
                        marginRight: '2px',
                        flexShrink: 0
                      }}
                    >
                      {step.digit}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 진행률 */}
            <div style={{
              marginTop: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                flex: 1,
                height: '4px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '2px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${((currentStep + 1) / steps.length) * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #d4a574, #f4d9a0)',
                  borderRadius: '2px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <span style={{
                fontSize: '13px',
                color: '#8b7355',
                minWidth: '80px',
                textAlign: 'right'
              }}>
                {currentStep + 1} / {steps.length} 단계
              </span>
            </div>
          </div>
        )}

        {/* 상세 계산 과정 */}
        {steps.length > 0 && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '16px',
            padding: '28px',
            marginBottom: '24px',
            border: '1px solid rgba(232, 180, 120, 0.15)'
          }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: '400',
              color: '#d4a574',
              marginTop: 0,
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '20px' }}>⟲</span>
              역순 계산 과정 / Reverse Calculation Steps
            </h2>

            <div 
              ref={stepsContainerRef}
              style={{
                maxHeight: '280px',
                overflowY: 'auto',
                paddingRight: '10px',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {steps.map((step, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'clamp(8px, 2vw, 16px)',
                    padding: 'clamp(8px, 2vw, 12px) clamp(10px, 2vw, 16px)',
                    marginBottom: '8px',
                    background: index <= currentStep 
                      ? 'rgba(232, 180, 120, 0.1)' 
                      : 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '8px',
                    borderLeft: index === currentStep 
                      ? '3px solid #d4a574' 
                      : '3px solid transparent',
                    opacity: index <= currentStep ? 1 : 0.3,
                    transition: 'all 0.3s',
                    flexWrap: 'wrap'
                  }}
                >
                  <span style={{
                    fontSize: '12px',
                    color: '#8b7355',
                    minWidth: '35px'
                  }}>
                    #{step.step}
                  </span>
                  
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontFamily: "'Fira Code', monospace",
                    fontSize: '14px',
                    flex: 1,
                    minWidth: '200px'
                  }}>
                    <span style={{ color: '#a89880' }}>{step.current}</span>
                    <span style={{ color: '#6b5b4f' }}>×</span>
                    <span style={{ color: '#d4a574' }}>{step.multiplier}</span>
                    {step.prevCarry > 0 && (
                      <>
                        <span style={{ color: '#ff6b6b', fontWeight: 'bold' }}>+</span>
                        <span style={{ color: '#7a9e7a' }}>{step.prevCarry}</span>
                      </>
                    )}
                    <span style={{ color: '#6b5b4f' }}>=</span>
                    <span style={{ color: '#f4d9a0', fontWeight: '600' }}>
                      {step.productWithCarry}
                    </span>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '13px'
                  }}>
                    <span style={{ color: '#8b7355' }}>
                      → 숫자: <span style={{ color: '#f4d9a0' }}>{step.digit}</span>
                    </span>
                    {step.carry > 0 && (
                      <span style={{ color: '#7a9e7a' }}>
                        올림: <span style={{ color: '#ff6b6b' }}>+</span>{step.carry}
                      </span>
                    )}
                  </div>

                  <div style={{
                    fontFamily: "'Fira Code', monospace",
                    fontSize: '13px',
                    color: '#d4a574',
                    letterSpacing: '1px',
                    marginLeft: 'auto'
                  }}>
                    {step.partialResult}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 결과 */}
        {result && currentStep >= steps.length - 1 && !showCelebration && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(232, 180, 120, 0.12), rgba(232, 180, 120, 0.05))',
            borderRadius: '16px',
            padding: '28px',
            marginBottom: '24px',
            border: '1px solid rgba(232, 180, 120, 0.25)',
            animation: 'fadeIn 0.5s ease'
          }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: '400',
              color: '#d4a574',
              marginTop: 0,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '20px' }}>✧</span>
              순환 마디 결과 / Repeating Decimal Result
            </h2>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                fontSize: '14px',
                color: '#a89880',
                marginBottom: '8px'
              }}>
                1/{denominator} = 0.
              </div>
              <div style={{
                fontFamily: "'Fira Code', monospace",
                fontSize: 'clamp(14px, 3vw, 22px)',
                color: '#f4d9a0',
                letterSpacing: '2px',
                padding: '16px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '8px',
                wordBreak: 'break-all',
                lineHeight: '1.6',
                textDecoration: 'overline'
              }}>
                {result}
              </div>
              <div style={{
                fontSize: '13px',
                color: '#8b7355',
                marginTop: '8px'
              }}>
                순환 마디 길이 / Cycle Length: {result.length}자리 / {result.length} digits
              </div>
            </div>

            {/* 대칭성 확인 */}
            {symmetryData && (
              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={() => setShowSymmetry(!showSymmetry)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(232, 180, 120, 0.3)',
                    borderRadius: '8px',
                    padding: '10px 24px',
                    fontSize: '14px',
                    color: '#d4a574',
                    cursor: 'pointer',
                    transition: 'all 0.3s'
                  }}
                >
                  {showSymmetry ? '대칭성 숨기기 / Hide Symmetry' : '🔮 대칭성 확인 / Check Symmetry'}
                </button>

                {showSymmetry && (
                  <div style={{
                    marginTop: '20px',
                    padding: 'clamp(12px, 3vw, 20px)',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '12px',
                    animation: 'fadeIn 0.3s ease'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 'clamp(8px, 2vw, 16px)',
                      flexWrap: 'wrap',
                      fontFamily: "'Fira Code', monospace",
                      fontSize: 'clamp(11px, 2.5vw, 14px)'
                    }}>
                      <div style={{
                        padding: 'clamp(8px, 2vw, 12px) clamp(10px, 2vw, 16px)',
                        background: 'rgba(122, 158, 122, 0.15)',
                        borderRadius: '8px',
                        color: '#a8c8a8',
                        wordBreak: 'break-all',
                        maxWidth: '40vw'
                      }}>
                        {symmetryData.first}
                      </div>
                      <span style={{ color: '#8b7355', fontSize: 'clamp(16px, 4vw, 20px)' }}>+</span>
                      <div style={{
                        padding: 'clamp(8px, 2vw, 12px) clamp(10px, 2vw, 16px)',
                        background: 'rgba(158, 122, 122, 0.15)',
                        borderRadius: '8px',
                        color: '#c8a8a8',
                        wordBreak: 'break-all',
                        maxWidth: '40vw'
                      }}>
                        {symmetryData.second}
                      </div>
                      <span style={{ color: '#8b7355', fontSize: 'clamp(16px, 4vw, 20px)' }}>=</span>
                      <div style={{
                        padding: 'clamp(8px, 2vw, 12px) clamp(10px, 2vw, 16px)',
                        background: symmetryData.isNines 
                          ? 'rgba(232, 180, 120, 0.2)' 
                          : 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        color: symmetryData.isNines ? '#f4d9a0' : '#a89880',
                        fontWeight: '600',
                        wordBreak: 'break-all',
                        maxWidth: '40vw'
                      }}>
                        {symmetryData.sum}
                      </div>
                    </div>
                    {symmetryData.isNines && (
                      <div style={{
                        marginTop: '12px',
                        color: '#d4a574',
                        fontSize: '14px'
                      }}>
                        ✨ 완벽한 9의 대칭! / Perfect 9's symmetry!<br/>
                        <span style={{ fontSize: '12px', color: '#a89880' }}>
                          The first and second halves sum to all 9s
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 설명 카드 */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '16px',
          padding: 'clamp(16px, 4vw, 24px)',
          border: '1px solid rgba(232, 180, 120, 0.1)',
          marginBottom: '40px'
        }}>
          <h3 style={{
            fontSize: 'clamp(14px, 3vw, 15px)',
            fontWeight: '500',
            color: '#d4a574',
            marginTop: 0,
            marginBottom: '16px'
          }}>
            📜 에카디카 원리란? / What is the Ekadhika Principle?
          </h3>
          <div style={{
            fontSize: 'clamp(12px, 3vw, 14px)',
            lineHeight: '1.8',
            color: '#a89880'
          }}>
            <p style={{ margin: '0 0 12px 0' }}>
              베다 수학에서 분모가 9로 끝나는 분수의 순환소수를 빠르게 구하는 방법입니다.<br/>
              <span style={{ fontSize: '12px', color: '#8b7355' }}>
                A Vedic Mathematics technique for quickly finding repeating decimals of fractions with denominators ending in 9.
              </span>
            </p>
            <p style={{ margin: '0 0 12px 0' }}>
              <strong style={{ color: '#d4a574' }}>매개수 계산 / Ekadhika Calculation:</strong> 분모 = 10n - 1 일 때, 매개수 = n<br/>
              <span style={{ fontSize: '12px', color: '#8b7355' }}>
                When denominator = 10n - 1, Ekadhika = n
              </span>
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: '#d4a574' }}>역순 계산 / Reverse Calculation:</strong> 1부터 시작하여 매개수를 계속 곱하고, 10 이상이면 올림합니다.<br/>
              <span style={{ fontSize: '12px', color: '#8b7355' }}>
                Start from 1, multiply by Ekadhika repeatedly, carry over when ≥10.
              </span>
            </p>
          </div>
        </div>


      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@300;400;500;600&family=Fira+Code:wght@400;500&family=Noto+Sans+KR:wght@300;400;500;700&display=swap');
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes logoGlow {
          0%, 100% { 
            filter: drop-shadow(0 0 15px rgba(212, 165, 116, 0.6)) drop-shadow(0 0 30px rgba(184, 149, 106, 0.4));
          }
          50% { 
            filter: drop-shadow(0 0 25px rgba(212, 165, 116, 0.8)) drop-shadow(0 0 45px rgba(184, 149, 106, 0.6));
          }
        }
        
        @keyframes digitSlideIn {
          from { 
            opacity: 0; 
            transform: translateX(-20px) scale(1.2);
          }
          to { 
            opacity: 1; 
            transform: translateX(0) scale(1);
          }
        }
        
        @keyframes carryAppear {
          0% { 
            opacity: 0; 
            transform: translateX(-50%) translateY(20px) scale(0.5);
          }
          50% {
            opacity: 1;
            transform: translateX(-50%) translateY(-5px) scale(1.2);
          }
          100% { 
            opacity: 1; 
            transform: translateX(-50%) translateY(0) scale(1);
          }
        }
        
        @keyframes carryDisappear {
          0% { 
            opacity: 1; 
            transform: translateX(-50%) translateY(0) scale(1);
          }
          50% {
            opacity: 0.5;
            transform: translateX(-50%) translateY(-10px) scale(0.8);
          }
          100% { 
            opacity: 0; 
            transform: translateX(-50%) translateY(-20px) scale(0.3);
          }
        }
        
        @keyframes carryAbsorb {
          0% { 
            color: #7a9e7a;
            transform: scale(1.3);
            text-shadow: 0 0 15px rgba(122, 200, 122, 0.8);
          }
          100% { 
            color: #7a9e7a;
            transform: scale(1);
            text-shadow: none;
          }
        }
        
        @keyframes popIn {
          0% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        
        @keyframes confettiFall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        
        @keyframes celebrationPop {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        
        ::-webkit-scrollbar {
          width: 6px;
        }
        
        ::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb {
          background: rgba(232, 180, 120, 0.3);
          border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(232, 180, 120, 0.5);
        }
        
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        
        input[type="number"] {
          -moz-appearance: textfield;
        }
        
        button:hover {
          transform: translateY(-1px);
          filter: brightness(1.1);
        }
        
        button:active {
          transform: translateY(0);
        }
        
        /* 모바일 터치 기기에서 hover 효과 제거 */
        @media (hover: none) {
          button:hover {
            transform: none;
            filter: none;
          }
        }
        
        /* 로고 컨테이너 반응형 */
        .logo-container {
          flex-shrink: 0;
        }
        
        .logo-container svg {
          width: clamp(60px, 15vw, 80px);
          height: clamp(60px, 15vw, 80px);
        }
        
        /* 모바일 스크롤바 스타일 */
        @media (max-width: 480px) {
          ::-webkit-scrollbar {
            width: 4px;
            height: 4px;
          }
        }
        
        /* 가로 스크롤바 */
        ::-webkit-scrollbar:horizontal {
          height: 6px;
        }
        
        /* 터치 스크롤 개선 */
        * {
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>
    </div>
  );
};

export default VedicMathApp;
