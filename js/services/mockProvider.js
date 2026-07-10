/* ========================================
   Mock AI Provider
   Generates IELTS listening passages from
   templates. Replace with apiProvider.js
   when connecting to a real AI API.
   ======================================== */

(function () {
  'use strict';

  /* ── Template library ── */
  var SCENE_TEMPLATES = {
    'academic-lecture': [
      // Template 1 — Social Science
      {
        title: 'The Role of {W0} in Modern Society',
        paragraphs: [
          'Good morning everyone, and welcome to today\'s lecture. We will be examining the relationship between <b>{W0}</b> and contemporary social structures. As I mentioned in our previous session, understanding the dynamics of <b>{W0}</b> is essential for anyone studying modern sociology.',
          'Let us begin by considering how <b>{W1}</b> has transformed over the past two decades. Research conducted at leading universities has consistently shown that <b>{W1}</b> plays a pivotal role in shaping public discourse. In fact, a recent study by the Institute for Social Research found that nearly seventy percent of respondents identified <b>{W1}</b> as a key factor influencing their daily decisions.',
          'Furthermore, we cannot overlook the significance of <b>{W2}</b> in this context. Scholars have long debated whether <b>{W2}</b> should be considered a cause or a consequence of broader societal changes. What is clear, however, is that the interplay between <b>{W0}</b>, <b>{W1}</b>, and <b>{W2}</b> creates a complex web of interactions that demands careful analysis.',
          'I would now like to draw your attention to some data from our field research. When we examined communities where <b>{W2}</b> was actively promoted, we observed measurable improvements in overall well-being. This suggests that policies encouraging <b>{W2}</b> could have far-reaching benefits beyond what we initially anticipated.',
          'To conclude today\'s lecture, I want you to reflect on the connections between these three concepts. Your assignment for next week is to write a short essay exploring how <b>{W0}</b> affects your own field of study. Please also consider the role of <b>{W1}</b> and <b>{W2}</b> in your analysis. Thank you for your attention, and I look forward to reading your submissions.'
        ]
      },
      // Template 2 — Science & Technology
      {
        title: 'Advances in {W0} Research',
        paragraphs: [
          'Today I would like to discuss recent advances in the field of <b>{W0}</b>. Over the past few years, significant progress has been made in understanding the fundamental mechanisms underlying <b>{W0}</b>, and these discoveries have opened up new possibilities for practical applications.',
          'One of the most exciting developments has been the integration of <b>{W1}</b> into our research methodology. By combining traditional approaches with <b>{W1}</b>, our team has been able to achieve results that were previously thought impossible. This breakthrough has attracted considerable attention from both academic and industrial partners.',
          'Another important factor to consider is <b>{W2}</b>. Our experiments have demonstrated a clear correlation between <b>{W2}</b> and the efficiency of our systems. Specifically, when <b>{W2}</b> is optimized, we observe a forty-five percent increase in overall performance. This finding has significant implications for future research directions.'
        ]
      }
    ],

    'campus-conversation': [
      // Template 1 — Student & Professor
      {
        title: 'Office Hours: Discussing {W0}',
        paragraphs: [
          '<b>Student:</b> "Excuse me, Professor. Do you have a moment to talk about the assignment on <b>{W0}</b>? I\'ve been struggling with some of the concepts."',
          '<b>Professor:</b> "Of course, come in. What specifically about <b>{W0}</b> is giving you trouble?"',
          '<b>Student:</b> "Well, I understand the basic definition, but I\'m having difficulty seeing how it connects to <b>{W1}</b>. The textbook mentions them together, but the relationship isn\'t very clear to me."',
          '<b>Professor:</b> "That\'s an excellent question. Think of <b>{W0}</b> as the foundation, and <b>{W1}</b> as the framework built on top of it. Without a solid understanding of <b>{W0}</b>, <b>{W1}</b> can seem quite abstract. Have you reviewed the supplementary materials I posted online?"',
          '<b>Student:</b> "Yes, I have. The case study about <b>{W2}</b> was particularly helpful. It gave me a concrete example of how these ideas apply in the real world. I was wondering if there are more resources that explore the link between <b>{W2}</b> and what we\'re studying?"',
          '<b>Professor:</b> "I\'m glad you found that useful. Actually, I\'d recommend checking out the research paper by Dr. Thompson. She explores how <b>{W2}</b> has evolved over the past decade and its implications for both <b>{W0}</b> and <b>{W1}</b>. I think it will give you the perspective you\'re looking for."'
        ]
      },
      // Template 2 — Study Group
      {
        title: 'Library Study Session',
        paragraphs: [
          '<b>Emma:</b> "Hey everyone, thanks for meeting up. I thought we could start by going over the key terms for the exam. First up: <b>{W0}</b>. Does anyone have a good definition?"',
          '<b>James:</b> "I think <b>{W0}</b> refers to how different elements interact within a system. But what confuses me is how it differs from <b>{W1}</b>. They seem pretty similar."',
          '<b>Emma:</b> "Not exactly. The main difference is that <b>{W0}</b> focuses on the broader picture, while <b>{W1}</b> deals with specific components. Think of it like looking at a forest versus looking at individual trees."',
          '<b>Sarah:</b> "That\'s a really helpful analogy. I was also wondering about <b>{W2}</b>. The lecturer mentioned it several times last week, but I didn\'t fully grasp its significance."',
          '<b>James:</b> "From what I gathered, <b>{W2}</b> is the practical application of the theories we\'ve been discussing. So when you combine an understanding of <b>{W0}</b>, <b>{W1}</b>, and <b>{W2}</b>, you get a complete picture of the subject."'
        ]
      }
    ],

    'daily-life': [
      // Template 1 — Podcast Style
      {
        title: 'Everyday Conversations: {W0}',
        paragraphs: [
          'Welcome back to another episode of "Everyday English." Today, I want to talk about something that has been on my mind lately: <b>{W0}</b>. You know, it is surprising how often <b>{W0}</b> comes up in our daily lives without us even realizing it.',
          'Just last week, I was having coffee with a friend, and we got into a fascinating discussion about <b>{W1}</b>. She pointed out that most people underestimate the importance of <b>{W1}</b> in maintaining a balanced lifestyle. I have to admit, I had never really thought about it that way before, but the more I considered it, the more I agreed with her perspective.',
          'Another thing that struck me recently was reading an article about <b>{W2}</b>. The author made a compelling argument that our understanding of <b>{W2}</b> has changed dramatically over the last generation. When I compared my own experiences with those of my parents, the difference was quite remarkable.',
          'So here is what I have learned: <b>{W0}</b>, <b>{W1}</b>, and <b>{W2}</b> are not just abstract concepts — they shape the way we experience the world every single day. The next time you encounter any of these in your own life, I encourage you to pause and reflect on their broader significance.'
        ]
      },
      // Template 2 — News Report
      {
        title: 'Community Focus: The Growing Importance of {W0}',
        paragraphs: [
          'In local news today, residents have been increasingly vocal about <b>{W0}</b> and its impact on the community. At a recent town hall meeting, citizens expressed a wide range of opinions on how <b>{W0}</b> should be addressed by local authorities.',
          'Council member Sarah Williams noted that <b>{W1}</b> has become a top priority for many families in the area. "We are seeing more and more people recognize that <b>{W1}</b> is not something we can afford to ignore," she said in her opening remarks. The council has proposed several initiatives aimed at improving <b>{W1}</b> across all neighborhoods.',
          'Meanwhile, a local advocacy group has been raising awareness about <b>{W2}</b>. According to their spokesperson, public understanding of <b>{W2}</b> remains limited, despite its significant implications for long-term community development. The group is planning a series of workshops to educate residents about <b>{W2}</b> and its connection to both <b>{W0}</b> and <b>{W1}</b>.'
        ]
      }
    ],

    'environment-nature': [
      // Template 1 — Documentary Style
      {
        title: 'Our Changing Planet: The Impact of {W0}',
        paragraphs: [
          'Nestled between towering mountains and sprawling coastlines lies one of the most fascinating ecosystems on Earth. Here, the delicate balance of nature is constantly influenced by <b>{W0}</b>, a factor that scientists have identified as crucial to the health of our planet.',
          'For decades, researchers have been monitoring how <b>{W1}</b> affects biodiversity in this region. Their findings have been both alarming and hopeful. On one hand, the data clearly shows that unchecked <b>{W1}</b> leads to significant habitat loss and species decline. On the other hand, conservation efforts that prioritize <b>{W1}</b> have shown remarkable results, with several endangered species making a steady recovery.',
          'Perhaps the most compelling evidence comes from studies on <b>{W2}</b>. When local communities embraced <b>{W2}</b> as part of their conservation strategy, the transformation was extraordinary. Rivers that had run dry for years began to flow again, and native vegetation returned in abundance. This demonstrates that <b>{W2}</b>, when combined with a genuine commitment to <b>{W0}</b> and <b>{W1}</b>, can reverse even decades of environmental damage.',
          'As we look toward the future, the message is clear: our relationship with <b>{W0}</b> must change. Every choice we make — from the products we buy to the policies we support — has a direct impact on the natural world. By embracing <b>{W1}</b> and investing in <b>{W2}</b>, we can build a more sustainable future for generations to come.'
        ]
      },
      // Template 2 — Climate Panel
      {
        title: 'Panel Discussion: Addressing {W0} in the 21st Century',
        paragraphs: [
          '<b>Moderator:</b> "Welcome to our panel on environmental challenges. Let me start with a question for Dr. Chen: how serious is the issue of <b>{W0}</b> compared to other environmental concerns?"',
          '<b>Dr. Chen:</b> "Thank you. I would argue that <b>{W0}</b> is among the most urgent challenges we face today. The scientific consensus is overwhelming — the data shows that <b>{W0}</b> has accelerated at an unprecedented rate over the past fifty years."',
          '<b>Moderator:</b> "Professor Adebayo, your work focuses on <b>{W1}</b>. How does this fit into the broader picture?"',
          '<b>Prof. Adebayo:</b> "Excellent question. <b>{W1}</b> is fundamentally connected to <b>{W0}</b>. In my research across twelve countries, I found that communities that actively manage <b>{W1}</b> are far more resilient. However, we still face major obstacles in scaling these solutions, primarily due to a lack of public awareness about <b>{W2}</b>."',
          '<b>Moderator:</b> "That brings us to our third panelist. Ms. Okonkwo, your organization has been promoting <b>{W2}</b>. What progress have you seen?"',
          '<b>Ms. Okonkwo:</b> "The momentum behind <b>{W2}</b> has been genuinely inspiring. When people understand that <b>{W2}</b> directly affects their health, their economy, and their children\'s future, they become powerful advocates for change. The key is connecting <b>{W2}</b> to everyday concerns that people already care about."'
        ]
      }
    ]
  };

  /* ── Difficulty modifiers ── */
  var DIFFICULTY_CONFIG = {
    'easy': {
      wordCount: '180-250',
      sentenceLength: 'short',
      vocabulary: 'intermediate',
      speed: 'slow',
      label: 'Easy',
    },
    'medium': {
      wordCount: '250-350',
      sentenceLength: 'moderate',
      vocabulary: 'upper-intermediate',
      speed: 'normal',
      label: 'Medium',
    },
    'hard': {
      wordCount: '350-450',
      sentenceLength: 'varied',
      vocabulary: 'advanced',
      speed: 'fast',
      label: 'Hard',
    },
  };

  /**
   * Fill placeholders in a template with user words.
   * If fewer than 3 words are provided, reuses existing words.
   */
  function fillTemplate(template, words) {
    var filled = [];
    var wordCount = words.length;

    for (var i = 0; i < 3; i++) {
      if (i < wordCount) {
        filled.push(words[i]);
      } else if (wordCount > 0) {
        // Reuse existing words cyclically
        filled.push(words[i % wordCount]);
      } else {
        filled.push('this topic');
      }
    }

    var title = template.title
      .replace(/\{W0\}/g, filled[0])
      .replace(/\{W1\}/g, filled[1])
      .replace(/\{W2\}/g, filled[2]);

    var passage = template.paragraphs
      .join('\n\n')
      .replace(/\{W0\}/g, filled[0])
      .replace(/\{W1\}/g, filled[1])
      .replace(/\{W2\}/g, filled[2]);

    return {
      title: title,
      passage: passage,
    };
  }

  /**
   * Generate a mock IELTS listening passage.
   *
   * @param {Object} params
   * @param {string[]} params.words       - Target vocabulary words
   * @param {string}   params.scene       - Scene key (e.g. 'academic-lecture')
   * @param {string}   params.voice       - Voice key (e.g. 'british-female')
   * @param {string}   [params.difficulty='medium'] - 'easy' | 'medium' | 'hard'
   * @returns {Promise<Object>} Resolves with { passage, title, targetWords, metadata }
   */
  function generate(params) {
    var words = params.words || [];
    var scene = params.scene || 'academic-lecture';
    var difficulty = params.difficulty || 'medium';

    return new Promise(function (resolve) {
      // Simulate AI processing delay (800–2000ms)
      var delay = 800 + Math.random() * 1200;

      setTimeout(function () {
        var templates = SCENE_TEMPLATES[scene] || SCENE_TEMPLATES['academic-lecture'];

        // Pick a random template for variety
        var templateIndex = Math.floor(Math.random() * templates.length);
        var template = templates[templateIndex];

        var result = fillTemplate(template, words);

        var diffConfig = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG['medium'];

        resolve({
          passage: result.passage,
          title: result.title,
          targetWords: words.slice(),
          metadata: {
            scene: scene,
            difficulty: difficulty,
            difficultyLabel: diffConfig.label,
            voice: params.voice || 'british-female',
            wordCount: result.passage.split(/\s+/).length,
            estimatedDuration: estimateDuration(result.passage, difficulty),
            generatedBy: 'mock',
            generatedAt: new Date().toISOString(),
            templateIndex: templateIndex,
          },
        });
      }, delay);
    });
  }

  /**
   * Roughly estimate listening duration based on word count and difficulty.
   * IELTS Section 4 is ~130 wpm (words per minute).
   */
  function estimateDuration(passage, difficulty) {
    var wpm = {
      'easy': 110,
      'medium': 130,
      'hard': 150,
    };
    var words = passage.split(/\s+/).length;
    var minutes = words / (wpm[difficulty] || 130);
    var seconds = Math.round(minutes * 60);
    return seconds;
  }

  /* ── Expose ── */
  window.MockAIProvider = {
    generate: generate,
    SCENE_TEMPLATES: SCENE_TEMPLATES,
    DIFFICULTY_CONFIG: DIFFICULTY_CONFIG,
  };
})();
