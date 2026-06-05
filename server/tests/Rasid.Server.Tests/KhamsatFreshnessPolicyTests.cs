using Rasid.Server.Models;
using Rasid.Server.Options;
using Rasid.Server.Services;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class KhamsatFreshnessPolicyTests
{
    [Fact]
    public void ParseJobPostedAt_ParsesKhamsatDayFirstGmtDatesBeforeGenericParsing()
    {
        Assert.Equal(
            DateTimeOffset.Parse("2026-06-05T08:30:00+00:00"),
            KhamsatFreshnessPolicy.ParseJobPostedAt("05/06/2026 08:30 GMT"));
        Assert.Equal(
            DateTimeOffset.Parse("2026-06-05T00:00:00+00:00"),
            KhamsatFreshnessPolicy.ParseJobPostedAt("05/06/2026 GMT"));
        Assert.Null(KhamsatFreshnessPolicy.ParseJobPostedAt("31/02/2026 08:30 GMT"));
    }

    [Fact]
    public void Classify_UsesConfiguredFortyEightHourFreshnessWindow()
    {
        var options = new JobScraperOptions();
        var now = DateTimeOffset.Parse("2026-06-05T12:00:00+00:00");

        Assert.Equal(48, options.KhamsatPublishFreshnessHours);
        Assert.Equal(TimeSpan.FromHours(48), KhamsatFreshnessPolicy.GetFreshnessWindow(options));
        Assert.Equal(
            KhamsatFreshness.Fresh,
            KhamsatFreshnessPolicy.Classify(
                CreateJob("05/06/2026 08:30 GMT"),
                now,
                options));
        Assert.Equal(
            KhamsatFreshness.Stale,
            KhamsatFreshnessPolicy.Classify(
                CreateJob("01/06/2026 08:30 GMT"),
                now,
                options));
        Assert.Equal(
            KhamsatFreshness.Retry,
            KhamsatFreshnessPolicy.Classify(CreateJob(null), now, options));
    }

    private static JobListing CreateJob(string? postedAt) =>
        new(
            Id: "9",
            PlatformId: "khamsat",
            Title: "طلب",
            Budget: string.Empty,
            Time: string.Empty,
            Url: "https://khamsat.com/community/requests/9-request",
            PostedAt: postedAt);
}
