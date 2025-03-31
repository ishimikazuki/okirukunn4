const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const moment = require('moment-timezone');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
dotenv.config();

// Set timezone
moment.tz.setDefault('Asia/Tokyo');

// LINE Bot configuration
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// Create Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Bot command configurations
const BOT_CONFIG = {
  commands: {
    setWakeupTime: /(\d{1,2})(?::|(時))(\d{0,2})に起きる/,
    goodSleep: ["ぐっすり", "明日パス", "明日休み"],
    goodSleepCancel: ["ぐっすり取消", "ぐっすり取り消し", "ぐっすりキャンセル"],
    recordCheck: ["記録確認", "記録"],
    settingsCheck: ["設定確認", "設定"],
    help: ["使い方", "ヘルプ", "help"],
    wakeupKeywords: ["起きた", "起床", "おはよう", "朝"]
  },
  messages: {
    wakeupSuccess: "{userName}さん、起床報告を記録しました✔️",
    wakeupAlreadyReported: "今日はすでに起床報告済みです！",
    timeSetSuccess: "OK！{hours}:{minutes}に設定しました⏰",
    timeFormatError: "時間の形式が正しくありません。例: 7時に起きる または 7:00に起きる",
    noTimeSet: "起床時間が設定されていません。\n7時に起きる で設定してください。",
    goodSleepSuccess: "{userName}さん、明日の早起きはパスします。ゆっくりぐっすり眠ってください😴\n（週に1回のぐっすり機能を使用しました）",
    goodSleepTimeLimit: "ぐっすり機能は22時までに宣言する必要があります。",
    goodSleepWeeklyLimit: "ぐっすり機能は週に1回しか使用できません。",
    goodSleepCancelSuccess: "{userName}さん、ぐっすり機能の使用を取り消しました。明日の早起きは通常通り必要です。",
    goodSleepNotUsed: "ぐっすり機能を使用していないため、取り消しできません。",
    allSuccess: "全員が時間通りに起きました！連続記録は{streak}日目です🎉",
    someoneFailure: "⚠️ {failedUsers}さんが寝坊しました…連続記録はリセットされます💀\n（{oldStreak}日でした）",
    recordStatus: "現在の連続記録: {streak}日\n最高連続記録: {best}日",
    userSettings: "{userName}さんの起床時間: {hours}:{minutes}",
    unknownCommand: "コマンドが認識できませんでした。\n「使い方」でヘルプを表示します。"
  },
  helpText: `起きるくんneo使い方ガイド 

📱 基本コマンド
・「7時に起きる」「6:30に起きる」
→ 起床時間を設定 

・ 「起きた」「起床」「おはよう」「朝」
→ 起床報告 

・ 「ぐっすり」「明日パス」「明日休み」
→ 翌日の早起きをパス（週1回まで）

・ 「記録確認」
→ 連続記録・最高記録を確認

・ 「設定確認」「設定」
→ 自分の起床時間を確認 

・ 「使い方」「ヘルプ」「help」→ コマンド一覧、ヘルプを表示

🔄 使い方の流れ
起床時間を設定（例：「7時に起きる」）
↓
翌日設定時間までに起床報告（例：「おはよう！」） 
↓
12:00に結果集計→全員成功でチャレンジ達成。連続記録を目指そう！

😴 ぐっすり機能（特別パス）
使用条件：22:00より前に宣言必須 
使用回数：週に1回まで 
取り消し：「ぐっすり取消」で取消可能

📊 集計について
・毎日正午に自動集計 
・全員成功→連続記録UP
・誰か失敗→連続記録リセット

⚠️ 注意点
・起床報告は設定時間より前に必要 
・同じ日の起床報告は1回まで 
・起床時間未設定は集計対象外`,
  welcomeMessage: `朝の怠惰と戦うLINEbot"起きるくん"です！

朝起きるのが苦手なあなたも、友達と一緒なら変われる。
「起きるくん」は、チームの力で早起き習慣を楽しく身につけるLINEbotです！

⭐️主な特徴 
みんなで挑戦: グループ全員で早起きに挑戦 
記録更新: 連続達成日数を自動カウント、最高記録更新を目指そう 
ぐっすり機能: 週に1回だけ特別に寝坊OKな日を作れる 
自分のペース: 各自で起床時間を設定可能

⭐️使い方はカンタン
①「7時に起きる」と宣言 
②朝、設定時間までに「起きた」とコメント
③正午に自動集計、全員成功で記録UP！ 

⭐️ぐっすり機能などの詳しい使い方を知りたかったら【ヘルプ】と送ってね！ 

幸福な1日は早起きから。
今日から始める、明日が変わる。僕と一緒に朝に打ち勝とう！`
};

// Create LINE client
const client = new line.Client(config);

// Create Express app
const app = express();

// Parse LINE webhook requests
app.use('/webhook', line.middleware(config));

// Utility functions
function isWakeupReport(text) {
  return BOT_CONFIG.commands.wakeupKeywords.some(keyword => text.includes(keyword));
}

function isSameDay(date1, date2) {
  return moment(date1).isSame(date2, 'day');
}

function getWeekStartDate() {
  return moment().startOf('week').format('YYYY-MM-DD');
}

// Handle events
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    // Handle non-text message events
    if (event.type === 'join' || event.type === 'memberJoined') {
      return handleJoinOrMemberJoinedEvent(event);
    }
    return null;
  }

  const { text } = event.message;
  const userId = event.source.userId;
  const groupId = event.source.groupId;

  try {
    // Get user profile
    const profile = await client.getProfile(userId);
    const userName = profile.displayName;

    // Get or create user
    let { data: user, error: userError } = await supabase
      .from('users')
      .select()
      .eq('id', userId)
      .single();

    if (userError && userError.code === 'PGRST116') {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{
          id: userId,
          name: userName,
          week_start_date: getWeekStartDate()
        }])
        .select()
        .single();

      if (createError) throw createError;
      user = newUser;
    } else if (userError) {
      throw userError;
    }

    // If group message, get or create group and add user to group
    if (groupId) {
      let { data: group, error: groupError } = await supabase
        .from('groups')
        .select()
        .eq('id', groupId)
        .single();

      if (groupError && groupError.code === 'PGRST116') {
        const { error: createError } = await supabase
          .from('groups')
          .insert([{ id: groupId }]);

        if (createError) throw createError;
      }

      // Check if user is in group, add if not
      const { data: groupUser, error: groupUserError } = await supabase
        .from('group_users')
        .select()
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .single();

      if (groupUserError && groupUserError.code === 'PGRST116') {
        const { error: createError } = await supabase
          .from('group_users')
          .insert([{
            group_id: groupId,
            user_id: userId
          }]);

        if (createError) throw createError;
      }
    }

    // Check and update week start date if necessary
    const currentWeekStart = getWeekStartDate();
    if (user.week_start_date !== currentWeekStart) {
      await supabase
        .from('users')
        .update({
          week_start_date: currentWeekStart,
          week_joker_count: 0
        })
        .eq('id', userId);
      
      user.week_start_date = currentWeekStart;
      user.week_joker_count = 0;
    }

    // Process commands
    // Check for wake-up time setting
    const timeSettingMatch = text.match(BOT_CONFIG.commands.setWakeupTime);
    if (timeSettingMatch) {
      return handleTimeSettingCommand(event, timeSettingMatch, userId, groupId, userName);
    }

    // Check for wakeup report
    if (isWakeupReport(text)) {
      return handleWakeupReport(event, userId, groupId, userName);
    }

    // Check for good sleep command
    if (BOT_CONFIG.commands.goodSleep.some(keyword => text === keyword)) {
      return handleGoodSleepCommand(event, userId, groupId, userName);
    }

    // Check for good sleep cancel command
    if (BOT_CONFIG.commands.goodSleepCancel.some(keyword => text === keyword)) {
      return handleGoodSleepCancelCommand(event, userId, groupId, userName);
    }

    // Check for record check command
    if (BOT_CONFIG.commands.recordCheck.some(keyword => text === keyword)) {
      return handleRecordCommand(event, userId, groupId);
    }

    // Check for settings check command
    if (BOT_CONFIG.commands.settingsCheck.some(keyword => text === keyword)) {
      return handleSettingsCommand(event, userId, groupId, userName);
    }

    // Check for help command
    if (BOT_CONFIG.commands.help.some(keyword => text === keyword)) {
      return handleHelpCommand(event);
    }

    // If no command matched
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: BOT_CONFIG.messages.unknownCommand
    });

  } catch (error) {
    console.error('Error handling event:', error);
    return null;
  }
}

// Handle join or memberJoined events
async function handleJoinOrMemberJoinedEvent(event) {
  try {
    // If bot was added to a group
    if (event.type === 'join') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: BOT_CONFIG.welcomeMessage
      });
    }

    // If new members joined the group
    if (event.type === 'memberJoined') {
      const groupId = event.source.groupId;
      const welcomeMessage = BOT_CONFIG.welcomeMessage;
      
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: welcomeMessage
      });
    }
  } catch (error) {
    console.error('Error handling join event:', error);
    return null;
  }
}

// Handle time setting command
async function handleTimeSettingCommand(event, timeSettingMatch, userId, groupId, userName) {
  try {
    const hours = parseInt(timeSettingMatch[1], 10);
    const minutes = timeSettingMatch[3] ? parseInt(timeSettingMatch[3], 10) : 0;

    // Validate time
    if (isNaN(hours) || hours < 0 || hours > 23 || isNaN(minutes) || minutes < 0 || minutes > 59) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: BOT_CONFIG.messages.timeFormatError
      });
    }

    // Update user
    await supabase
      .from('users')
      .update({
        wakeup_time_hours: hours,
        wakeup_time_minutes: minutes
      })
      .eq('id', userId);

    // Format minutes with leading zero if needed
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;

    // Reply success
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: BOT_CONFIG.messages.timeSetSuccess
        .replace('{hours}', hours)
        .replace('{minutes}', formattedMinutes)
    });
  } catch (error) {
    console.error('Error handling time setting command:', error);
    return null;
  }
}

// Handle wakeup report
async function handleWakeupReport(event, userId, groupId, userName) {
  try {
    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    // Check if already reported today
    const now = moment();
    if (user.last_report && isSameDay(user.last_report, now)) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: BOT_CONFIG.messages.wakeupAlreadyReported
      });
    }

    // Check if wakeup time is set
    if (user.wakeup_time_hours === null || user.wakeup_time_minutes === null) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: BOT_CONFIG.messages.noTimeSet
      });
    }

    // Check if report is before wakeup time
    const wakeupTime = moment().set({
      hour: user.wakeup_time_hours,
      minute: user.wakeup_time_minutes,
      second: 0
    });

    // Update user
    await supabase
      .from('users')
      .update({
        last_report: now.toISOString(),
        today_reported: true
      })
      .eq('id', userId);

    // Reply success
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: BOT_CONFIG.messages.wakeupSuccess.replace('{userName}', userName)
    });
  } catch (error) {
    console.error('Error handling wakeup report:', error);
    return null;
  }
}

// Handle good sleep command
async function handleGoodSleepCommand(event, userId, groupId, userName) {
  try {
    // Check if it's before 22:00
    const now = moment();
    if (now.hour() >= 22) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: BOT_CONFIG.messages.goodSleepTimeLimit
      });
    }

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    // Check weekly limit
    if (user.week_joker_count >= 1) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: BOT_CONFIG.messages.goodSleepWeeklyLimit
      });
    }

    // Update user
    await supabase
      .from('users')
      .update({
        joker_used: true,
        last_joker_date: now.toISOString(),
        week_joker_count: user.week_joker_count + 1
      })
      .eq('id', userId);

    // Reply success
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: BOT_CONFIG.messages.goodSleepSuccess.replace('{userName}', userName)
    });
  } catch (error) {
    console.error('Error handling good sleep command:', error);
    return null;
  }
}

// Handle good sleep cancel command
async function handleGoodSleepCancelCommand(event, userId, groupId, userName) {
  try {
    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    // Check if joker is used
    if (!user.joker_used) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: BOT_CONFIG.messages.goodSleepNotUsed
      });
    }

    // Update user
    await supabase
      .from('users')
      .update({
        joker_used: false,
        week_joker_count: user.week_joker_count - 1
      })
      .eq('id', userId);

    // Reply success
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: BOT_CONFIG.messages.goodSleepCancelSuccess.replace('{userName}', userName)
    });
  } catch (error) {
    console.error('Error handling good sleep cancel command:', error);
    return null;
  }
}

// Handle record check command
async function handleRecordCommand(event, userId, groupId) {
  try {
    if (!groupId) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: "このコマンドはグループチャットでのみ使用できます。"
      });
    }

    // Get group
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupError) throw groupError;

    // Reply with record
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: BOT_CONFIG.messages.recordStatus
        .replace('{streak}', group.current_streak)
        .replace('{best}', group.best_streak)
    });
  } catch (error) {
    console.error('Error handling record command:', error);
    return null;
  }
}

// Handle settings check command
async function handleSettingsCommand(event, userId, groupId, userName) {
  try {
    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    // Check if wakeup time is set
    if (user.wakeup_time_hours === null || user.wakeup_time_minutes === null) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: BOT_CONFIG.messages.noTimeSet
      });
    }

    // Format minutes with leading zero if needed
    const formattedMinutes = user.wakeup_time_minutes < 10 ? 
      `0${user.wakeup_time_minutes}` : user.wakeup_time_minutes;

    // Reply with settings
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: BOT_CONFIG.messages.userSettings
        .replace('{userName}', userName)
        .replace('{hours}', user.wakeup_time_hours)
        .replace('{minutes}', formattedMinutes)
    });
  } catch (error) {
    console.error('Error handling settings command:', error);
    return null;
  }
}

// Handle help command
async function handleHelpCommand(event) {
  try {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: BOT_CONFIG.helpText
    });
  } catch (error) {
    console.error('Error handling help command:', error);
    return null;
  }
}

// Daily check all reports (run at 12:00)
async function checkAllGroupReports() {
  try {
    console.log('Running daily report check at', moment().format('YYYY-MM-DD HH:mm:ss'));

    // Get all groups
    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('*');

    if (groupsError) throw groupsError;

    // For each group
    for (const group of groups) {
      // Get all users in the group
      const { data: groupUsers, error: groupUsersError } = await supabase
        .from('group_users')
        .select('user_id')
        .eq('group_id', group.id);

      if (groupUsersError) throw groupUsersError;

      // If no users in group, skip
      if (groupUsers.length === 0) continue;

      // Get all user details
      const userIds = groupUsers.map(gu => gu.user_id);
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*')
        .in('id', userIds);

      if (usersError) throw usersError;

      // Filter users with wakeup time set
      const usersWithWakeupTime = users.filter(u => 
        u.wakeup_time_hours !== null && u.wakeup_time_minutes !== null);

      // If no users with wakeup time, skip
      if (usersWithWakeupTime.length === 0) continue;

      // Check which users reported and which didn't
      const failedUsers = [];
      const today = moment();

      for (const user of usersWithWakeupTime) {
        // Skip users who used joker
        if (user.joker_used) {
          console.log(`User ${user.name} used joker, skipping`);
          continue;
        }

        // If no report or report not today
        if (!user.last_report || !isSameDay(user.last_report, today)) {
          failedUsers.push(user);
        }
      }

      // Reset today_reported and joker_used for all users
      await supabase
        .from('users')
        .update({
          today_reported: false,
          joker_used: false
        })
        .in('id', userIds);

      // Update group streak
      let messageText;
      if (failedUsers.length === 0 && usersWithWakeupTime.length > 0) {
        // All succeeded
        const newStreak = group.current_streak + 1;
        const newBestStreak = Math.max(group.best_streak, newStreak);
        
        await supabase
          .from('groups')
          .update({
            current_streak: newStreak,
            best_streak: newBestStreak
          })
          .eq('id', group.id);
        
        messageText = BOT_CONFIG.messages.allSuccess.replace('{streak}', newStreak);
      } else if (failedUsers.length > 0) {
        // Someone failed
        const failedNames = failedUsers.map(u => u.name).join('、');
        
        await supabase
          .from('groups')
          .update({
            current_streak: 0
          })
          .eq('id', group.id);
        
        messageText = BOT_CONFIG.messages.someoneFailure
          .replace('{failedUsers}', failedNames)
          .replace('{oldStreak}', group.current_streak);
      } else {
        // No users with wakeup time set
        continue;
      }

      // Send result message to group
      await client.pushMessage(group.id, {
        type: 'text',
        text: messageText
      });
    }
  } catch (error) {
    console.error('Error in daily report check:', error);
  }
}

// Schedule daily check at 12:00
cron.schedule('0 12 * * *', checkAllGroupReports);

// Route for checking if server is running
app.get('/', (req, res) => {
  res.send('起きるくん Bot Server is running!');
});

// Webhook endpoint
app.post('/webhook', (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Timezone set to:', moment.tz.guess());
});