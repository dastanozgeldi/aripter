export const CATEGORY_POOL = [
  { Animal: { Russian: "Животное", Kazakh: "Жануар", Japanese: "動物" } },
  { City: { Russian: "Город", Kazakh: "Қала", Japanese: "都市" } },
  { Country: { Russian: "Страна", Kazakh: "Ел", Japanese: "国" } },
  { Food: { Russian: "Еда", Kazakh: "Тағам", Japanese: "食べ物" } },
  { Drink: { Russian: "Напиток", Kazakh: "Сусын", Japanese: "飲み物" } },
  { Movie: { Russian: "Фильм", Kazakh: "Фильм", Japanese: "映画" } },
  { Song: { Russian: "Песня", Kazakh: "Ән", Japanese: "歌" } },
  { Book: { Russian: "Книга", Kazakh: "Кітап", Japanese: "本" } },
  { Job: { Russian: "Профессия", Kazakh: "Мамандық", Japanese: "職業" } },
  {
    Sport: {
      Russian: "Вид спорта",
      Kazakh: "Спорт түрі",
      Japanese: "スポーツ",
    },
  },
  {
    Celebrity: {
      Russian: "Знаменитость",
      Kazakh: "Танымал адам",
      Japanese: "有名人",
    },
  },
  { Brand: { Russian: "Бренд", Kazakh: "Бренд", Japanese: "ブランド" } },
  { Plant: { Russian: "Растение", Kazakh: "Өсімдік", Japanese: "植物" } },
  { Clothing: { Russian: "Одежда", Kazakh: "Киім", Japanese: "衣服" } },
  { Vehicle: { Russian: "Транспорт", Kazakh: "Көлік", Japanese: "乗り物" } },
  {
    "Place in town": {
      Russian: "Место в городе",
      Kazakh: "Қаладағы орын",
      Japanese: "街の場所",
    },
  },
  {
    "Household item": {
      Russian: "Предмет быта",
      Kazakh: "Үй заты",
      Japanese: "家庭用品",
    },
  },
  {
    "School subject": {
      Russian: "Школьный предмет",
      Kazakh: "Мектеп пәні",
      Japanese: "学校の科目",
    },
  },
  {
    "Body part": {
      Russian: "Часть тела",
      Kazakh: "Дене мүшесі",
      Japanese: "体の部位",
    },
  },
  {
    "Something in nature": {
      Russian: "Что-то в природе",
      Kazakh: "Табиғаттағы нәрсе",
      Japanese: "自然にあるもの",
    },
  },
];

export function getRandomCategoryCount(durationSeconds) {
  if (durationSeconds <= 60) return 6;
  if (durationSeconds < 90) return 8;
  return 10;
}

function translateCategory(category, language) {
  const [english, translations] = Object.entries(category)[0];
  return language === "English" ? english : translations[language] ?? english;
}

export function pickRandomCategories(
  language,
  durationSeconds,
  random = Math.random,
) {
  const shuffled = [...CATEGORY_POOL];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  return shuffled
    .slice(0, getRandomCategoryCount(durationSeconds))
    .map((category) => translateCategory(category, language));
}
