from pathlib import Path

path = Path("client/app/admin/tickets/[id]/page.tsx")
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)

start_i = compare_i = notes_i = None
for i, line in enumerate(lines):
    if start_i is None and "ticket-detail-body" in line:
        start_i = i
    if compare_i is None and "Current vs Previous Conversation" in line:
        for j in range(i, max(0, i - 6), -1):
            if "bg-white p-5 md:p-6 rounded-2xl" in lines[j]:
                compare_i = j
                break
    if notes_i is None and "<TicketNotesSection ticketId={id}" in line:
        notes_i = i

if start_i is None or compare_i is None or notes_i is None:
    raise SystemExit(f"markers missing start={start_i} compare={compare_i} notes={notes_i}")

children = lines[compare_i:notes_i]
indent_fix = "                            "  # workspace children indent

open_block = [
    '                    <div className="ticket-detail-body">\n',
    '                        <TicketDetailWorkspace\n',
    '                            ticket={ticket}\n',
    '                            analysis={analysis}\n',
    '                            isPresales={isPresales}\n',
    '                            agentName={agentName}\n',
    '                            agentInitials={agentInitials}\n',
    '                            metricCards={metricCards}\n',
    '                            sortedMoments={sortedMoments}\n',
    '                            seekToMoment={seekToMoment}\n',
    '                            getSentimentColor={getSentimentColor}\n',
    '                            renderStars={renderStars}\n',
    '                            isSuperAdmin={isSuperAdmin}\n',
    '                            onAvatarClick={handleAvatarClick}\n',
    '                            audio={{\n',
    '                                isPlaying,\n',
    '                                togglePlayback,\n',
    '                                restartPlayback,\n',
    '                                seekBy,\n',
    '                                formatTime,\n',
    '                                displayedCurrentTime,\n',
    '                                duration,\n',
    '                                progressPercent,\n',
    '                                bufferedPercent,\n',
    '                                waveformHeights,\n',
    '                                waveformBarCount: WAVEFORM_BAR_COUNT,\n',
    '                                waveformShellRef,\n',
    '                                handleSeekInput,\n',
    '                                commitScrub,\n',
    '                                setIsScrubbing,\n',
    '                                toggleMute,\n',
    '                                isMuted,\n',
    '                                VolumeIcon,\n',
    '                                volumePercent,\n',
    '                                effectiveVolume,\n',
    '                                applyVolume,\n',
    '                                cyclePlaybackSpeed,\n',
    '                                formatSpeed,\n',
    '                                playbackSpeed,\n',
    '                                audioError,\n',
    '                                audioUrl,\n',
    '                                audioRef,\n',
    '                                updateBufferedProgress,\n',
    '                                setCurrentTime,\n',
    '                                setDuration,\n',
    '                                setIsPlaying,\n',
    '                                setScrubTime,\n',
    '                                setAudioError,\n',
    '                                playbackSpeedValue: playbackSpeed,\n',
    '                                volume,\n',
    '                                clamp,\n',
    '                            }}\n',
    '                        >\n',
]

close_block = [
    '                        </TicketDetailWorkspace>\n',
]

new_lines = (
    lines[:start_i]
    + open_block
    + children
    + close_block
    + lines[notes_i:]
)

text = "".join(new_lines)
if "TicketDetailWorkspace" not in text.split("import")[0]:
    text = text.replace(
        "import { useAuth } from '@/contexts/AuthContext';\n",
        "import { useAuth } from '@/contexts/AuthContext';\nimport { TicketDetailWorkspace } from './TicketDetailWorkspace';\n",
    )

path.write_text(text, encoding="utf-8")
print("done", start_i, compare_i, notes_i, "removed", compare_i - start_i, "lines")
