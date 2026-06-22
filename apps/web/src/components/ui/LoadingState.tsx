type LoadingStateProps = {
  message: string;
};

export function LoadingState({ message }: LoadingStateProps) {
  return <div className="loading-state">{message}</div>;
}
