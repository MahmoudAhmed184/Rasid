using System.Globalization;
using System.Text.RegularExpressions;
using Rasid.Server.Models;
using Rasid.Server.Options;

namespace Rasid.Server.Services;

internal enum KhamsatFreshness
{
    Fresh,
    Stale,
    Retry
}

internal static class KhamsatFreshnessPolicy
{
    private static readonly Regex KhamsatGmtDateRegex = new(
        @"^\s*(?<day>\d{1,2})/(?<month>\d{1,2})/(?<year>\d{4})(?:\s+(?<hour>\d{1,2}):(?<minute>\d{2})(?::(?<second>\d{2}))?)?\s+GMT\s*$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly IReadOnlyDictionary<string, int> ArabicMonths =
        new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["يناير"] = 1,
            ["فبراير"] = 2,
            ["مارس"] = 3,
            ["أبريل"] = 4,
            ["مايو"] = 5,
            ["يونيو"] = 6,
            ["يوليو"] = 7,
            ["أغسطس"] = 8,
            ["سبتمبر"] = 9,
            ["أكتوبر"] = 10,
            ["نوفمبر"] = 11,
            ["ديسمبر"] = 12
        };

    public static TimeSpan GetFreshnessWindow(JobScraperOptions options) =>
        TimeSpan.FromHours(Math.Max(1, options.KhamsatPublishFreshnessHours));

    public static KhamsatFreshness Classify(
        JobListing job,
        DateTimeOffset now,
        JobScraperOptions options)
    {
        var postedAt = ParseJobPostedAt(job.PostedAt);

        if (postedAt is null)
        {
            return KhamsatFreshness.Retry;
        }

        return postedAt.Value >= now.Subtract(GetFreshnessWindow(options))
            ? KhamsatFreshness.Fresh
            : KhamsatFreshness.Stale;
    }

    public static DateTimeOffset? ParseJobPostedAt(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        var khamsatDate = ParseKhamsatGmtDate(trimmed);

        if (khamsatDate is not null)
        {
            return khamsatDate;
        }

        if (DateTimeOffset.TryParse(
                trimmed,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AllowWhiteSpaces,
                out var parsed))
        {
            return parsed;
        }

        var parts = trimmed.Split(
            ' ',
            StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length < 3 ||
            !int.TryParse(parts[0], out var day) ||
            !ArabicMonths.TryGetValue(parts[1], out var month) ||
            !int.TryParse(parts[2], out var year))
        {
            return null;
        }

        try
        {
            return new DateTimeOffset(year, month, day, 0, 0, 0, TimeSpan.Zero);
        }
        catch (ArgumentOutOfRangeException)
        {
            return null;
        }
    }

    private static DateTimeOffset? ParseKhamsatGmtDate(string value)
    {
        var match = KhamsatGmtDateRegex.Match(value);

        if (!match.Success ||
            !int.TryParse(match.Groups["day"].Value, out var day) ||
            !int.TryParse(match.Groups["month"].Value, out var month) ||
            !int.TryParse(match.Groups["year"].Value, out var year))
        {
            return null;
        }

        var hour = ParseOptionalInt(match.Groups["hour"].Value);
        var minute = ParseOptionalInt(match.Groups["minute"].Value);
        var second = ParseOptionalInt(match.Groups["second"].Value);

        try
        {
            return new DateTimeOffset(year, month, day, hour, minute, second, TimeSpan.Zero);
        }
        catch (ArgumentOutOfRangeException)
        {
            return null;
        }
    }

    private static int ParseOptionalInt(string value) =>
        int.TryParse(value, out var parsed) ? parsed : 0;
}
