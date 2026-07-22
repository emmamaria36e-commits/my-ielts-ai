/* ========================================
   Mock AI Provider (development only)
   Returns pre-written passages per scene.
   No template placeholders — each passage
   is a complete, natural IELTS text.

   Replace with APIProvider when connecting
   to a real AI API (DeepSeek / OpenAI).
   ======================================== */

(function () {
  'use strict';

  /* ── One short passage per scene (complete, no placeholders) ── */
  var PASSAGES = {
    'academic-lecture': {
      title: 'The Role of Urban Planning in Modern Society',
      passage: [
        'Good morning everyone, and welcome to today\'s lecture on urban development. We will be examining how modern cities have evolved over the past century and what challenges lie ahead.',
        'Let us begin by considering the concept of sustainable growth. Research conducted at leading universities has consistently shown that cities with comprehensive planning strategies tend to have better living conditions and more efficient public services. In fact, a recent study found that well-planned urban areas reduce commute times by an average of thirty percent compared to unplanned expansion.',
        'Furthermore, we cannot overlook the significance of community engagement. Scholars have long debated the most effective ways to involve local residents in the planning process. What is clear, however, is that cities that prioritize public input tend to develop in ways that better serve their populations. I would encourage you to consider how these principles apply to your own communities.',
      ].join('\n\n'),
    },

    'campus-conversation': {
      title: 'Office Hours: Discussing the Assignment',
      passage: [
        'Student: "Excuse me, Professor. Do you have a moment to talk about the essay assignment? I\'ve been struggling with narrowing down my topic."',
        'Professor: "Of course, come in. What areas are you considering?"',
        'Student: "Well, I\'m interested in how technology affects education. But I\'m worried the topic might be too broad for a two-thousand-word essay."',
        'Professor: "That\'s a fair concern. Let me suggest focusing on one specific aspect — perhaps the impact of online learning platforms on student engagement. There is plenty of research available, and the scope would be manageable."',
        'Student: "That sounds much more manageable. I was also wondering about the reference requirements. How many sources should I aim for?"',
        'Professor: "For this assignment, eight to twelve academic sources would be appropriate. Make sure to include a mix of journal articles and books. And don\'t forget to use the university library database — it has excellent resources on this topic."',
      ].join('\n\n'),
    },

    'daily-life': {
      title: 'Everyday Conversations: A Coffee Shop Chat',
      passage: [
        'Welcome back to another episode of "Everyday English." Today, I want to share a conversation I overheard at a local coffee shop that really got me thinking about how we spend our free time.',
        'I was sitting next to two friends who were catching up after not seeing each other for several months. One of them, Sarah, had recently changed jobs and was describing how her new position allowed her to work from home three days a week. She mentioned that this flexibility had completely transformed her daily routine — she now had time for morning exercise and could pick up her children from school.',
        'The other friend, Mark, had taken a different approach. He had started his own small business and was working longer hours than ever before. Despite the challenges, he seemed genuinely happy. He talked about the importance of pursuing work that feels meaningful, even when it is difficult.',
        'Their conversation reminded me that there is no single right way to structure our lives. What matters most is finding a balance that works for our individual circumstances and priorities.',
      ].join('\n\n'),
    },

    'environment-nature': {
      title: 'Our Changing Planet: Understanding Ecosystem Resilience',
      passage: [
        'Nestled between towering mountains and sprawling coastlines lies one of the most fascinating ecosystems on Earth. Here, scientists have been studying how natural environments respond to both gradual changes and sudden disruptions.',
        'Over the past two decades, researchers have documented remarkable examples of ecosystem recovery. In areas where conservation efforts were implemented early, native species have returned in numbers that exceeded expectations. One particularly encouraging case involved a coastal wetland that had been severely damaged by industrial activity. After fifteen years of careful management, the area now supports over two hundred species of birds and aquatic life.',
        'However, the research also reveals concerning trends. Climate change is accelerating the rate of environmental disruption, and some ecosystems are struggling to adapt quickly enough. Scientists emphasize that while nature has an impressive capacity for recovery, there are limits to what it can withstand without sustained human intervention and policy support.',
        'The message from these studies is clear: protecting our natural environment requires both immediate action and long-term commitment. Every decision we make today will shape the landscapes of tomorrow.',
      ].join('\n\n'),
    },
  };

  var DIFFICULTY_LABEL = {
    'easy': 'Easy', 'medium': 'Medium', 'hard': 'Hard',
  };

  /**
   * Generate a mock IELTS listening passage.
   *
   * @param {Object} p
   * @param {string[]} p.words      - target vocabulary
   * @param {string}   p.scene      - scene key
   * @param {string[]} p.voices     - voice keys (array)
   * @param {string}   p.difficulty - 'easy' | 'medium' | 'hard'
   * @returns {Promise<Object>}
   */
  function generate(p) {
    var words     = p.words || [];
    var scene     = p.scene || 'academic-lecture';
    var voices    = p.voices && p.voices.length ? p.voices : ['british-female'];
    var difficulty = p.difficulty || 'medium';

    // Build the prompt for debugging (same as real API would use)
    var prompt = window.PromptBuilder
      ? window.PromptBuilder.build({ words: words, scene: scene, voices: voices, difficulty: difficulty })
      : null;

    return new Promise(function (resolve) {
      var delay = 400 + Math.random() * 600; // 400–1000ms

      setTimeout(function () {
        var entry = PASSAGES[scene] || PASSAGES['academic-lecture'];

        if (prompt) {
          console.log('[MockProvider] Prompt that would be sent:\n', prompt.system);
        }

        resolve({
          passage: entry.passage,
          title: entry.title,
          targetWords: words.slice(),
          metadata: {
            scene: scene,
            difficulty: difficulty,
            difficultyLabel: DIFFICULTY_LABEL[difficulty] || 'Medium',
            voices: voices,
            wordCount: entry.passage.split(/\s+/).length,
            generatedBy: 'mock',
            generatedAt: new Date().toISOString(),
          },
        });
      }, delay);
    });
  }

  /* ── Expose ── */
  window.MockAIProvider = {
    generate: generate,
  };
})();
