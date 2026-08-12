export function getViewerVoteProgress(answers, viewerId) {
  const requiredAnswers = answers.filter(
    (answer) =>
      answer.playerId !== viewerId && Boolean(answer.value.trim()),
  );
  const completed = requiredAnswers.filter(
    (answer) => answer.viewerVote !== null,
  ).length;
  const total = requiredAnswers.length;
  const remaining = total - completed;

  return {
    completed,
    total,
    remaining,
    isComplete: remaining === 0,
  };
}
