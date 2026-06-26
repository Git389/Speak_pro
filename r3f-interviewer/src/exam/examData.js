// IELTS Academic practice test content. Replace/extend these to author new tests
// (this is the data the admin module will eventually edit). Answers are lowercased for matching.
export const EXAM = {
  title: 'IELTS Academic - Practice Test 1',
  listening: {
    minutes: 30,
    // Read aloud once by the browser voice (stands in for the audio recording).
    audioText:
      "Good morning. The community library is open from nine a m to eight p m on weekdays, and from ten to four on Saturdays. " +
      "To join, bring a photo identity card and one proof of address. Membership is free for students. " +
      "Members may borrow up to six books for three weeks, and renew online twice. The late fee is twenty pence per day. " +
      "The quiet study room is on the second floor, and group study rooms must be booked in advance.",
    items: [
      { id: 'L1', type: 'gap', q: 'On weekdays the library closes at ____ p.m.', answer: '8' },
      { id: 'L2', type: 'mcq', q: 'To join, you must bring a photo ID and:', options: ['a passport photo', 'one proof of address', 'two references'], answer: 'one proof of address' },
      { id: 'L3', type: 'gap', q: 'Membership is free for ____.', answer: 'students' },
      { id: 'L4', type: 'mcq', q: 'Members may borrow up to:', options: ['four books', 'six books', 'ten books'], answer: 'six books' },
      { id: 'L5', type: 'gap', q: 'The late fee is ____ pence per day.', answer: '20' },
      { id: 'L6', type: 'mcq', q: 'The quiet study room is on the:', options: ['ground floor', 'first floor', 'second floor'], answer: 'second floor' },
    ],
  },
  reading: {
    minutes: 60,
    passage:
      "The honey bee is among the most studied insects on Earth. A single colony may contain tens of thousands of workers, " +
      "all daughters of one queen. Workers progress through a sequence of roles as they age: cleaning cells, feeding larvae, " +
      "building comb, guarding the entrance, and finally foraging for nectar and pollen. Foragers communicate the location of " +
      "food through a 'waggle dance', whose angle and duration encode direction and distance. In recent decades, beekeepers " +
      "worldwide have reported sudden colony losses. Researchers link these losses to a combination of factors, including " +
      "parasitic mites, pesticides, and the loss of diverse flowering habitats, rather than to any single cause.",
    items: [
      { id: 'R1', type: 'tfng', q: 'All worker bees in a colony are female.', answer: 'true' },
      { id: 'R2', type: 'tfng', q: 'Bees take on the same role for their whole life.', answer: 'false' },
      { id: 'R3', type: 'tfng', q: 'The waggle dance encodes both direction and distance.', answer: 'true' },
      { id: 'R4', type: 'tfng', q: 'The passage names one single cause of colony losses.', answer: 'false' },
      { id: 'R5', type: 'gap', q: 'Older workers eventually leave the hive to ____ for nectar and pollen.', answer: 'forage' },
      { id: 'R6', type: 'mcq', q: 'Colony losses are linked to:', options: ['only pesticides', 'a combination of factors', 'cold weather alone'], answer: 'a combination of factors' },
    ],
  },
  writing: {
    minutes: 60,
    tasks: [
      { id: 'W1', minutes: 20, minWords: 150, title: 'Writing Task 1',
        prompt: 'The chart below shows the percentage of households with internet access in three countries between 2000 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant. (Describe the trend in at least 150 words.)' },
      { id: 'W2', minutes: 40, minWords: 250, title: 'Writing Task 2',
        prompt: 'Some people believe that universities should focus on providing academic skills, while others think they should prepare students for employment. Discuss both views and give your own opinion. Write at least 250 words.' },
    ],
  },
  speaking: { minutes: 14 }, // delivered by the conversational interviewer (talking-head when available, else 3D)
};
