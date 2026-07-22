import { fmtVar } from '@/lib/finance';

export default function Var({ actual, budget, flip }) {
  const { isFav, text } = fmtVar(actual, budget, flip);
  return <span className={isFav ? 'fav' : 'unfav'}>{text}</span>;
}
