import { useState, useEffect } from 'react';
import { getPoll, votePoll } from '../api/chats.api';
import useStore from '../store';
import styles from './PollResults.module.css';

export default function PollResults({ pollId, isActive }) {
  const [data, setData] = useState(null);
  const user = useStore(s => s.user);

  useEffect(() => {
    if (pollId) load();
  }, [pollId]);

  const load = async () => {
    try {
      const { data: d } = await getPoll(pollId);
      setData(d);
    } catch {}
  };

  const handleVote = async (optionId) => {
    try {
      await votePoll(pollId, optionId);
      load();
    } catch {}
  };

  if (!data) return null;

  const totalVotes = data.options?.reduce((s, o) => s + (o.votes?.[0]?.count || 0), 0) || 0;
  const hasVoted = !!data.myVote;

  return (
    <div className={styles.poll}>
      <div className={styles.question}>{data.poll?.question}</div>
      {data.options?.map(opt => {
        const count = opt.votes?.[0]?.count || 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isMyVote = data.myVote === opt.id;
        return (
          <div key={opt.id} className={`${styles.option} ${isMyVote ? styles.myVote : ''}`} onClick={() => !hasVoted && isActive && handleVote(opt.id)}>
            <div className={styles.bar} style={{ width: `${pct}%` }}></div>
            <span className={styles.label}>{opt.text}</span>
            <span className={styles.pct}>{pct}%</span>
          </div>
        );
      })}
      <div className={styles.footer}>{totalVotes} voto{totalVotes !== 1 ? 's' : ''}</div>
    </div>
  );
}
