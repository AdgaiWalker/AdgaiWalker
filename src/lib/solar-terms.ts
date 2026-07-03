export interface SolarTermData {
  name: string;
  english: string;
  poetic: string;
  themeType: 'light' | 'dark';
  colors: {
    orb1: string;
    orb2: string;
    orb3: string;
    orb4: string;
    brand: string;
    brandSecondary: string;
    bg: string;
    card: string;
    border: string;
    parchment: string;
    parchmentDim: string;
    mistBg: string;
  };
}

const transitionDays = [
  [5, 20],  // Jan: 小寒, 大寒
  [4, 19],  // Feb: 立春, 雨水
  [5, 20],  // Mar: 惊蛰, 春分
  [4, 19],  // Apr: 清明, 谷雨
  [5, 20],  // May: 立夏, 小满
  [5, 21],  // Jun: 芒种, 夏至
  [7, 22],  // Jul: 小暑, 大暑
  [7, 23],  // Aug: 立秋, 处暑
  [7, 22],  // Sep: 白露, 秋分
  [8, 23],  // Oct: 寒露, 霜降
  [7, 22],  // Nov: 立冬, 小雪
  [7, 21],  // Dec: 大雪, 冬至
];

// 共享的季节基础模板
const SPRING_BASE = {
  themeType: 'light' as const,
  bg: '#F7F6F2', // 点子温暖沙白
  card: 'rgba(255, 255, 255, 0.7)', 
  border: 'rgba(17, 17, 17, 0.06)',
  parchment: '#111111', // 点子主文字炭黑
  parchmentDim: '#8A8A8A', // 点子中性灰
  mistBg: 'rgba(247, 246, 242, 0.45)',
};

const SUMMER_BASE = {
  themeType: 'light' as const,
  bg: '#F7F6F2', // 点子温暖沙白
  card: 'rgba(255, 255, 255, 0.7)',
  border: 'rgba(17, 17, 17, 0.06)',
  parchment: '#111111', // 点子主文字炭黑
  parchmentDim: '#8A8A8A', // 点子中性灰
  mistBg: 'rgba(247, 246, 242, 0.45)',
};

const AUTUMN_BASE = {
  themeType: 'light' as const,
  bg: '#F7F6F2', // 点子温暖沙白
  card: 'rgba(255, 255, 255, 0.7)',
  border: 'rgba(17, 17, 17, 0.06)',
  parchment: '#111111', // 点子主文字炭黑
  parchmentDim: '#8A8A8A', // 点子中性灰
  mistBg: 'rgba(247, 246, 242, 0.45)',
};

const WINTER_BASE = {
  themeType: 'dark' as const,
  bg: '#090A0F', // 点子深夜极暗黑
  card: 'rgba(18, 19, 26, 0.7)', 
  border: 'rgba(255, 255, 255, 0.08)',
  parchment: '#E8E8ED', // 点子暗色纸张文本
  parchmentDim: '#86868B', // 点子辅助暗色文本
  mistBg: 'rgba(9, 10, 15, 0.5)',
};

const solarTermsMap: Record<string, SolarTermData> = {
  // ==================== 春季 (Spring) ====================
  '立春': {
    name: '立春',
    english: 'Beginning of Spring',
    poetic: '东风解冻，蛰虫始振，鱼陟负冰',
    themeType: SPRING_BASE.themeType,
    colors: {
      ...SPRING_BASE,
      orb1: 'rgba(164, 226, 198, 0.14)',
      orb2: 'rgba(251, 197, 197, 0.12)',
      orb3: 'rgba(252, 217, 201, 0.10)',
      orb4: 'rgba(162, 194, 232, 0.10)',
      brand: '#3B9C6F',
      brandSecondary: '#A4E2C6',
    }
  },
  '雨水': {
    name: '雨水',
    english: 'Rain Water',
    poetic: '獭祭鱼，候雁北，草木萌动',
    themeType: SPRING_BASE.themeType,
    colors: {
      ...SPRING_BASE,
      orb1: 'rgba(142, 228, 228, 0.14)',
      orb2: 'rgba(212, 196, 252, 0.12)',
      orb3: 'rgba(176, 203, 230, 0.10)',
      orb4: 'rgba(224, 224, 224, 0.08)',
      brand: '#2BA5A5',
      brandSecondary: '#8EE4E4',
    }
  },
  '惊蛰': {
    name: '惊蛰',
    english: 'Awakening of Insects',
    poetic: '桃始华，仓庚鸣，鹰化为鸠',
    themeType: SPRING_BASE.themeType,
    colors: {
      ...SPRING_BASE,
      orb1: 'rgba(203, 226, 93, 0.14)',
      orb2: 'rgba(252, 208, 75, 0.12)',
      orb3: 'rgba(221, 185, 107, 0.10)',
      orb4: 'rgba(112, 222, 203, 0.10)',
      brand: '#8FA323',
      brandSecondary: '#CBE25D',
    }
  },
  '春分': {
    name: '春分',
    english: 'Spring Equinox',
    poetic: '玄鸟至，雷乃发声，始电',
    themeType: SPRING_BASE.themeType,
    colors: {
      ...SPRING_BASE,
      orb1: 'rgba(255, 169, 184, 0.14)',
      orb2: 'rgba(178, 227, 123, 0.12)',
      orb3: 'rgba(221, 208, 251, 0.10)',
      orb4: 'rgba(255, 235, 179, 0.10)',
      brand: '#E66779',
      brandSecondary: '#FFA9B8',
    }
  },
  '清明': {
    name: '清明',
    english: 'Pure Brightness',
    poetic: '桐始华，田鼠化为鴽，虹始见',
    themeType: SPRING_BASE.themeType,
    colors: {
      ...SPRING_BASE,
      orb1: 'rgba(158, 216, 169, 0.14)',
      orb2: 'rgba(142, 186, 227, 0.12)',
      orb3: 'rgba(195, 213, 165, 0.10)',
      orb4: 'rgba(243, 243, 245, 0.10)',
      brand: '#4C9F62',
      brandSecondary: '#9ED8A9',
    }
  },
  '谷雨': {
    name: '谷雨',
    english: 'Grain Rain',
    poetic: '萍始生，鸣鸠拂其羽，戴胜降于桑',
    themeType: SPRING_BASE.themeType,
    colors: {
      ...SPRING_BASE,
      orb1: 'rgba(107, 184, 147, 0.14)',
      orb2: 'rgba(111, 154, 200, 0.12)',
      orb3: 'rgba(242, 222, 133, 0.10)',
      orb4: 'rgba(212, 203, 191, 0.10)',
      brand: '#298555',
      brandSecondary: '#6BB893',
    }
  },

  // ==================== 夏季 (Summer) ====================
  '立夏': {
    name: '立夏',
    english: 'Beginning of Summer',
    poetic: '蝼蝈鸣，蚯蚓出，王瓜生',
    themeType: SUMMER_BASE.themeType,
    colors: {
      ...SUMMER_BASE,
      orb1: 'rgba(96, 197, 138, 0.14)',
      orb2: 'rgba(104, 194, 243, 0.12)',
      orb3: 'rgba(253, 211, 75, 0.10)',
      orb4: 'rgba(251, 155, 127, 0.10)',
      brand: '#0A8446',
      brandSecondary: '#60C58A',
    }
  },
  '小满': {
    name: '小满',
    english: 'Grain Buds',
    poetic: '苦菜秀，靡草死，麦秋至',
    themeType: SUMMER_BASE.themeType,
    colors: {
      ...SUMMER_BASE,
      orb1: 'rgba(243, 219, 112, 0.14)',
      orb2: 'rgba(123, 227, 209, 0.12)',
      orb3: 'rgba(91, 187, 230, 0.10)',
      orb4: 'rgba(236, 235, 230, 0.10)',
      brand: '#C5A51B',
      brandSecondary: '#F3DB70',
    }
  },
  '芒种': {
    name: '芒种',
    english: 'Grain in Ear',
    poetic: '螳螂生，鵙始鸣，反舌无声',
    themeType: SUMMER_BASE.themeType,
    colors: {
      ...SUMMER_BASE,
      orb1: 'rgba(241, 190, 77, 0.14)',
      orb2: 'rgba(107, 191, 162, 0.12)',
      orb3: 'rgba(142, 167, 255, 0.10)',
      orb4: 'rgba(234, 113, 89, 0.10)',
      brand: '#D89B10',
      brandSecondary: '#F1BE4D',
    }
  },
  '夏至': {
    name: '夏至',
    english: 'Summer Solstice',
    poetic: '鹿角解，蜩始鸣，半夏生',
    themeType: SUMMER_BASE.themeType,
    colors: {
      ...SUMMER_BASE,
      orb1: 'rgba(14, 165, 233, 0.14)',
      orb2: 'rgba(0, 229, 255, 0.12)',
      orb3: 'rgba(56, 189, 248, 0.10)',
      orb4: 'rgba(255, 214, 10, 0.10)',
      brand: '#0284C7',
      brandSecondary: '#38BDF8',
    }
  },
  '小暑': {
    name: '小暑',
    english: 'Slight Heat',
    poetic: '温风至，蟋蟀居壁，鹰始挚',
    themeType: SUMMER_BASE.themeType,
    colors: {
      ...SUMMER_BASE,
      orb1: 'rgba(52, 211, 153, 0.14)',
      orb2: 'rgba(6, 182, 212, 0.12)',
      orb3: 'rgba(251, 191, 36, 0.10)',
      orb4: 'rgba(251, 113, 133, 0.10)',
      brand: '#0F766E',
      brandSecondary: '#34D399',
    }
  },
  '大暑': {
    name: '大暑',
    english: 'Great Heat',
    poetic: '腐草为萤，土润溽暑，大雨时行',
    themeType: SUMMER_BASE.themeType,
    colors: {
      ...SUMMER_BASE,
      orb1: 'rgba(5, 150, 105, 0.14)',
      orb2: 'rgba(239, 68, 68, 0.12)',
      orb3: 'rgba(245, 158, 11, 0.10)',
      orb4: 'rgba(29, 78, 216, 0.10)',
      brand: '#DC2626',
      brandSecondary: '#EF4444',
    }
  },

  // ==================== 秋季 (Autumn) ====================
  '立秋': {
    name: '立秋',
    english: 'Beginning of Autumn',
    poetic: '凉风至，白露降，寒蝉鸣',
    themeType: AUTUMN_BASE.themeType,
    colors: {
      ...AUTUMN_BASE,
      orb1: 'rgba(245, 158, 11, 0.14)',
      orb2: 'rgba(96, 165, 250, 0.12)',
      orb3: 'rgba(217, 119, 6, 0.10)',
      orb4: 'rgba(229, 231, 235, 0.10)',
      brand: '#CA8A04',
      brandSecondary: '#F59E0B',
    }
  },
  '处暑': {
    name: '处暑',
    english: 'Limit of Heat',
    poetic: '鹰乃祭鸟，天地始肃，禾乃登',
    themeType: AUTUMN_BASE.themeType,
    colors: {
      ...AUTUMN_BASE,
      orb1: 'rgba(132, 204, 22, 0.14)',
      orb2: 'rgba(192, 132, 252, 0.12)',
      orb3: 'rgba(234, 179, 8, 0.10)',
      orb4: 'rgba(156, 163, 179, 0.10)',
      brand: '#65A30D',
      brandSecondary: '#84CC16',
    }
  },
  '白露': {
    name: '白露',
    english: 'White Dew',
    poetic: '鸿雁来，玄鸟归，群鸟养羞',
    themeType: AUTUMN_BASE.themeType,
    colors: {
      ...AUTUMN_BASE,
      orb1: 'rgba(209, 213, 219, 0.14)',
      orb2: 'rgba(249, 250, 251, 0.12)',
      orb3: 'rgba(147, 197, 253, 0.10)',
      orb4: 'rgba(167, 243, 208, 0.10)',
      brand: '#4B5563',
      brandSecondary: '#9CA3AF',
    }
  },
  '秋分': {
    name: '秋分',
    english: 'Autumn Equinox',
    poetic: '雷始收声，蛰虫坯户，水始涸',
    themeType: AUTUMN_BASE.themeType,
    colors: {
      ...AUTUMN_BASE,
      orb1: 'rgba(249, 115, 22, 0.14)',
      orb2: 'rgba(59, 130, 246, 0.12)',
      orb3: 'rgba(239, 68, 68, 0.10)',
      orb4: 'rgba(234, 179, 8, 0.10)',
      brand: '#EA580C',
      brandSecondary: '#F97316',
    }
  },
  '寒露': {
    name: '寒露',
    english: 'Cold Dew',
    poetic: '鸿雁来宾，雀入大水为蛤，菊有黄华',
    themeType: AUTUMN_BASE.themeType,
    colors: {
      ...AUTUMN_BASE,
      orb1: 'rgba(251, 146, 60, 0.14)',
      orb2: 'rgba(75, 85, 99, 0.12)',
      orb3: 'rgba(30, 58, 138, 0.10)',
      orb4: 'rgba(202, 138, 4, 0.10)',
      brand: '#C2410C',
      brandSecondary: '#FB923C',
    }
  },
  '霜降': {
    name: '霜降',
    english: 'Frost Descent',
    poetic: '豺乃祭兽，草木黄落，蛰虫咸俯',
    themeType: AUTUMN_BASE.themeType,
    colors: {
      ...AUTUMN_BASE,
      orb1: 'rgba(243, 244, 246, 0.14)',
      orb2: 'rgba(239, 68, 68, 0.12)',
      orb3: 'rgba(6, 95, 70, 0.10)',
      orb4: 'rgba(55, 48, 163, 0.10)',
      brand: '#B91C1C',
      brandSecondary: '#EF4444',
    }
  },

  // ==================== 冬季 (Winter) ====================
  '立冬': {
    name: '立冬',
    english: 'Beginning of Winter',
    poetic: '水始冰，地始冻，雉入大水为蜃',
    themeType: WINTER_BASE.themeType,
    colors: {
      ...WINTER_BASE,
      orb1: 'rgba(30, 41, 59, 0.16)',
      orb2: 'rgba(55, 65, 81, 0.14)',
      orb3: 'rgba(229, 231, 235, 0.10)',
      orb4: 'rgba(249, 115, 22, 0.10)',
      brand: '#2E5BCE',
      brandSecondary: '#5A8BFD',
    }
  },
  '小雪': {
    name: '小雪',
    english: 'Light Snow',
    poetic: '虹藏不见，天气上升地气下降，闭塞而成冬',
    themeType: WINTER_BASE.themeType,
    colors: {
      ...WINTER_BASE,
      orb1: 'rgba(248, 250, 252, 0.16)',
      orb2: 'rgba(191, 219, 254, 0.14)',
      orb3: 'rgba(100, 116, 139, 0.10)',
      orb4: 'rgba(254, 240, 138, 0.10)',
      brand: '#3B82F6',
      brandSecondary: '#93C5FD',
    }
  },
  '大雪': {
    name: '大雪',
    english: 'Heavy Snow',
    poetic: '鶡鴠不鸣，虎始交，荔挺出',
    themeType: WINTER_BASE.themeType,
    colors: {
      ...WINTER_BASE,
      orb1: 'rgba(20, 83, 45, 0.16)',
      orb2: 'rgba(255, 255, 255, 0.14)',
      orb3: 'rgba(165, 243, 252, 0.10)',
      orb4: 'rgba(249, 115, 22, 0.10)',
      brand: '#166534',
      brandSecondary: '#4ADE80',
    }
  },
  '冬至': {
    name: '冬至',
    english: 'Winter Solstice',
    poetic: '蚯蚓结，麋角解，水泉动',
    themeType: WINTER_BASE.themeType,
    colors: {
      ...WINTER_BASE,
      orb1: 'rgba(15, 23, 42, 0.16)',
      orb2: 'rgba(74, 222, 128, 0.14)',
      orb3: 'rgba(192, 132, 252, 0.10)',
      orb4: 'rgba(219, 234, 254, 0.10)',
      brand: '#6366F1',
      brandSecondary: '#A5B4FC',
    }
  },
  '小寒': {
    name: '小寒',
    english: 'Slight Cold',
    poetic: '雁北乡，鹊始巢，雉始鸲',
    themeType: WINTER_BASE.themeType,
    colors: {
      ...WINTER_BASE,
      orb1: 'rgba(251, 207, 232, 0.16)',
      orb2: 'rgba(209, 213, 219, 0.14)',
      orb3: 'rgba(6, 78, 59, 0.10)',
      orb4: 'rgba(239, 246, 255, 0.10)',
      brand: '#EC4899',
      brandSecondary: '#FBCFE8',
    }
  },
  '大寒': {
    name: '大寒',
    english: 'Great Cold',
    poetic: '鸡始乳，征鸟厉疾，水泽腹坚',
    themeType: WINTER_BASE.themeType,
    colors: {
      ...WINTER_BASE,
      orb1: 'rgba(15, 23, 42, 0.16)',
      orb2: 'rgba(226, 232, 240, 0.14)',
      orb3: 'rgba(225, 29, 72, 0.10)',
      orb4: 'rgba(254, 240, 138, 0.10)',
      brand: '#E11D48',
      brandSecondary: '#FDA4AF',
    }
  }
};

const termsOrder = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
];

export function getSolarTerm(date: Date = new Date()): SolarTermData {
  const m = date.getMonth(); // 0-indexed
  const d = date.getDate();

  let termName = '';

  if (d < transitionDays[m][0]) {
    // 属于前一月的第二个节气
    const prevMonth = m === 0 ? 11 : m - 1;
    termName = termsOrder[prevMonth * 2 + 1];
  } else if (d >= transitionDays[m][0] && d < transitionDays[m][1]) {
    // 属于当月的第一个节气
    termName = termsOrder[m * 2];
  } else {
    // 属于当月的第二个节气
    termName = termsOrder[m * 2 + 1];
  }

  return solarTermsMap[termName] ?? solarTermsMap['夏至'];
}
