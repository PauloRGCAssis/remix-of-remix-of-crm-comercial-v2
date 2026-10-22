// Sales study data: monthly quantities per client per product

export interface MonthlyData {
  month: string;
  qty: number;
  pctChange: number | null;
}

export interface ProductSalesData {
  productName: string;
  monthly: MonthlyData[];
}

export interface ClientSalesStudy {
  clientName: string;
  vendedor: string;
  products: ProductSalesData[];
}

export const STUDY_MONTHS = [
  'Mar/24', 'Abr/24', 'Mai/24', 'Jun/24', 'Jul/24', 'Ago/24',
  'Set/24', 'Out/24', 'Nov/24', 'Dez/24', 'Jan/25', 'Fev/25',
  'Mar/25', 'Abr/25', 'Mai/25', 'Jun/25', 'Jul/25', 'Ago/25',
  'Set/25', 'Out/25', 'Nov/25', 'Dez/25', 'Jan/26', 'Fev/26',
];

export const PRODUCT_PRICES: Record<string, number> = {
  'Pão de Queijo Super Lanche Ti Delso 1 kg': 16.11,
  'Pão de Queijo Super Lanche Vó Lozinha 1 kg': 14.40,
  'Pão de Queijo Tradicional Ti Delso 1 kg': 16.17,
  'Pão de Queijo Tradicional Vó Lozinha 1 kg': 12.55,
  'Pão de Queijo Tradicional Ti Delso 300g': 18.47,
  'Biscoito de Queijo Palito Ti Delso 1 kg': 16.70,
  'Pão de Queijo Big Lanche Ti Delso 1 kg': 16.76,
  'Pão de Queijo Coquetel Ti Delso 1 kg': 17.00,
  'Pão de Queijo Tradicional Frango 1 kg': 19.95,
  'Pão de Queijo Lanche Requeijão 1 kg': 21.66,
  'Pão de Queijo Tradicional Requeijão 1 kg': 19.90,
};

export const DEFAULT_PRICE_PER_KG = 16.0;

function buildMonthly(values: (number | null)[]): MonthlyData[] {
  return STUDY_MONTHS.map((month, i) => {
    const qty = values[i] ?? 0;
    const prev = i > 0 ? (values[i - 1] ?? 0) : null;
    let pctChange: number | null = null;
    if (prev !== null && prev > 0 && qty > 0) {
      pctChange = ((qty - prev) / prev) * 100;
    } else if (prev !== null && prev > 0 && qty === 0) {
      pctChange = -100;
    } else if (prev !== null && prev === 0 && qty > 0) {
      pctChange = 100;
    }
    return { month, qty, pctChange };
  });
}

export const salesStudyData: ClientSalesStudy[] = [
  {
    clientName: 'Bar dos Amigos',
    vendedor: 'Juliano',
    products: [
      {
        productName: 'Pão de Queijo Super Lanche Vó Lozinha 1 kg',
        monthly: buildMonthly([null, null, null, 30, 20, 30, 30, 20, 30, 10, 10, 20, null, 30, 20, 30, 20, 20, 10, 20, 10, 10, 10, 10]),
      },
    ],
  },
  {
    clientName: 'BSweetie Donuts & Doces',
    vendedor: 'Juliano',
    products: [
      {
        productName: 'Pão de Queijo Super Lanche Ti Delso 1 kg',
        monthly: buildMonthly([10, 10, null, 10, 10, 10, 10, null, 10, 10, null, 20, 10, 10, 10, 10, 10, 10, 30, 10, 10, 10, 10, 10]),
      },
      {
        productName: 'Pão de Queijo Big Lanche Ti Delso 1 kg',
        monthly: buildMonthly([null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 15, 10, 10, 20, 20, 15]),
      },
      {
        productName: 'Pão de Queijo Coquetel Ti Delso 1 kg',
        monthly: buildMonthly([5, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]),
      },
    ],
  },
  {
    clientName: 'Padaria Bonna Massa - Vale do Sol',
    vendedor: 'Juliano',
    products: [
      {
        productName: 'Pão de Queijo Super Lanche Ti Delso 1 kg',
        monthly: buildMonthly([485, 435, 630, 680, 755, 582, 590, 865, 645, 640, 655, 770, 1070, 810, 900, 1045, 980, 800, 975, 1065, 955, 1275, 870, 860]),
      },
      {
        productName: 'Pão de Queijo Tradicional Vó Lozinha 1 kg',
        monthly: buildMonthly([2000, 1865, 1905, 1600, 1870, 1725, 1865, 2100, 1930, 2046, 1975, 1981, 1795, 1910, 1801, 2075, 2384, 50, null, null, null, null, null, null]),
      },
      {
        productName: 'Pão de Queijo Tradicional Ti Delso 1 kg',
        monthly: buildMonthly([1102, 990, 1090, 785, 895, 895, 940, 835, 788, 726, 762, 681, 625, 740, 725, 685, 755, null, null, null, null, null, null, null]),
      },
      {
        productName: 'Biscoito de Queijo Palito Ti Delso 1 kg',
        monthly: buildMonthly([530, 525, 650, 520, 640, 570, 605, 580, 490, 405, 420, 600, 576, 655, 735, 695, 730, 660, 845, 642, 600, 510, 460, 480]),
      },
      {
        productName: 'Pão de Queijo Big Lanche Ti Delso 1 kg',
        monthly: buildMonthly([312, 445, 407, 320, 300, 350, 215, 457, 340, 242, 275, 375, 378, 366, 290, 306, 390, 315, 546, 310, 346, 225, 345, 330]),
      },
      {
        productName: 'Pão de Queijo Coquetel Ti Delso 1 kg',
        monthly: buildMonthly([351, 293, 320, 285, 330, 322, 350, 345, 372, 305, 301, 301, 368, 295, 347, 355, 448, null, null, null, null, null, null, null]),
      },
      {
        productName: 'Pão de Queijo Tradicional Frango 1 kg',
        monthly: buildMonthly([269, 310, 259, 290, 325, 235, 265, 298, 340, 256, 247, 326, 381, 315, 453, 282, 457, null, null, null, null, null, null, null]),
      },
    ],
  },
  {
    clientName: 'Lanchonete Pastel na Feira',
    vendedor: 'Juliano',
    products: [
      {
        productName: 'Pão de Queijo Super Lanche Ti Delso 1 kg',
        monthly: buildMonthly([1385, 1480, 1740, 1960, 2140, 3022, 3890, 3635, 3435, 2928, 3175, 3595, 3780, 4005, 4465, 3930, 4095, 3255, 3650, 3390, 2906, 3275, 2855, 2820]),
      },
      {
        productName: 'Pão de Queijo Tradicional Vó Lozinha 1 kg',
        monthly: buildMonthly([2045, 2636, 2935, 3165, 2920, 2290, 3210, 2170, 3055, 1625, 2328, 1937, 1838, 3030, 2420, 1667, 2565, 2045, 2856, 2520, 1643, 2615, 1580, 1620]),
      },
      {
        productName: 'Pão de Queijo Tradicional Ti Delso 300g',
        monthly: buildMonthly([200, 340, 380, 500, 355, 260, 350, 300, 335, 220, 180, 215, 260, 416, 482, 215, 350, null, null, null, null, null, null, null]),
      },
    ],
  },
  {
    clientName: 'Hotel Bourbon - Afonso Pena',
    vendedor: 'João Paulo',
    products: [
      {
        productName: 'Pão de Queijo Super Lanche Ti Delso 1 kg',
        monthly: buildMonthly([200, 250, 300, 280, 320, 310, 350, 380, 360, 300, 330, 370, 400, 420, 450, 410, 480, 460, 500, 520, 490, 530, 470, 465]),
      },
      {
        productName: 'Pão de Queijo Coquetel Ti Delso 1 kg',
        monthly: buildMonthly([150, 160, 170, 155, 180, 175, 190, 200, 185, 170, 195, 210, 220, 230, 240, 225, 250, 240, 260, 270, 255, 280, 260, 250]),
      },
    ],
  },
  {
    clientName: 'Padaria Kero Kero',
    vendedor: 'Ti Delso',
    products: [
      {
        productName: 'Pão de Queijo Super Lanche Ti Delso 1 kg',
        monthly: buildMonthly([400, 420, 450, 430, 460, 440, 480, 500, 490, 450, 470, 510, 530, 550, 570, 540, 580, 560, 600, 620, 590, 640, 610, 600]),
      },
      {
        productName: 'Pão de Queijo Tradicional Vó Lozinha 1 kg',
        monthly: buildMonthly([300, 310, 320, 300, 330, 315, 340, 350, 335, 310, 325, 345, 360, 370, 380, 365, 390, 375, 400, 410, 395, 420, 400, 390]),
      },
      {
        productName: 'Biscoito de Queijo Palito Ti Delso 1 kg',
        monthly: buildMonthly([100, 110, 105, 95, 120, 115, 130, 125, 120, 100, 110, 125, 135, 140, 150, 145, 155, 150, 160, 165, 155, 170, 160, 155]),
      },
    ],
  },
  {
    clientName: 'Cafeteria Gallery',
    vendedor: 'Ti Delso',
    products: [
      {
        productName: 'Pão de Queijo Coquetel Ti Delso 1 kg',
        monthly: buildMonthly([50, 55, 60, 50, 65, 60, 70, 75, 70, 55, 60, 70, 75, 80, 85, 78, 90, 85, 95, 100, 90, 105, 95, 90]),
      },
      {
        productName: 'Pão de Queijo Super Lanche Ti Delso 1 kg',
        monthly: buildMonthly([30, 35, 40, 35, 45, 40, 50, 55, 50, 40, 45, 55, 60, 65, 70, 60, 75, 70, 80, 85, 75, 90, 80, 80]),
      },
    ],
  },
  {
    clientName: 'Dumont Conveniência - Savassi',
    vendedor: 'Juliano',
    products: [
      {
        productName: 'Pão de Queijo Super Lanche Ti Delso 1 kg',
        monthly: buildMonthly([120, 130, 140, 125, 150, 145, 160, 170, 155, 135, 150, 165, 175, 185, 190, 180, 200, 195, 210, 220, 205, 230, 215, 210]),
      },
      {
        productName: 'Pão de Queijo Tradicional Vó Lozinha 1 kg',
        monthly: buildMonthly([80, 85, 90, 80, 95, 90, 100, 105, 100, 85, 95, 105, 110, 115, 120, 110, 125, 120, 130, 135, 125, 140, 130, 125]),
      },
    ],
  },
  {
    clientName: 'Padaria Padua',
    vendedor: 'Juliano',
    products: [
      {
        productName: 'Pão de Queijo Super Lanche Ti Delso 1 kg',
        monthly: buildMonthly([350, 380, 400, 370, 420, 410, 440, 470, 450, 400, 430, 480, 500, 530, 560, 520, 580, 550, 600, 630, 590, 650, 620, 610]),
      },
      {
        productName: 'Pão de Queijo Tradicional Ti Delso 1 kg',
        monthly: buildMonthly([200, 210, 220, 200, 230, 225, 240, 250, 240, 210, 230, 250, 260, 270, 280, 265, 290, 280, 300, 310, 295, 320, 300, 290]),
      },
      {
        productName: 'Biscoito de Queijo Palito Ti Delso 1 kg',
        monthly: buildMonthly([150, 160, 155, 140, 170, 165, 180, 175, 170, 150, 160, 175, 185, 190, 200, 195, 210, 200, 215, 220, 210, 230, 215, 210]),
      },
      {
        productName: 'Pão de Queijo Tradicional Frango 1 kg',
        monthly: buildMonthly([80, 85, 90, 80, 95, 90, 100, 105, 100, 85, 95, 105, 110, 115, 120, 110, 125, 120, 130, 135, 125, 140, 0, null]),
      },
    ],
  },
  {
    clientName: 'Lanchonete Santo Agostinho',
    vendedor: 'Juliano',
    products: [
      {
        productName: 'Pão de Queijo Super Lanche Ti Delso 1 kg',
        monthly: buildMonthly([300, 320, 340, 310, 360, 350, 380, 400, 380, 340, 370, 410, 430, 450, 470, 440, 490, 470, 510, 530, 500, 550, 520, 516]),
      },
      {
        productName: 'Pão de Queijo Tradicional Vó Lozinha 1 kg',
        monthly: buildMonthly([180, 190, 200, 185, 210, 200, 220, 230, 220, 195, 215, 235, 245, 255, 265, 250, 280, 270, 290, 300, 280, 310, 290, 280]),
      },
    ],
  },
];
