namespace Rasid.Server.Tests;

public sealed class TestTimeProvider(DateTimeOffset initialTime) : TimeProvider
{
    private DateTimeOffset _currentTime = initialTime;

    public override DateTimeOffset GetUtcNow() => _currentTime;

    public void Advance(TimeSpan delta) => _currentTime = _currentTime.Add(delta);

    public void SetUtcNow(DateTimeOffset time) => _currentTime = time;
}
