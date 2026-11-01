#!/usr/bin/perl
# Decides on one Bash command for bash-guard.sh: prints "block<TAB>reason" or "ask<TAB>reason", or nothing.
# Usage: bash-guard.pl <cwd> < command
use strict;
use warnings;

my $cwd = $ARGV[0] || '.';
my $raw = do { local $/; <STDIN> } // '';

sub decide { print "$_[0]\t$_[1]\n"; exit 0 }

# Join line continuations; replace heredoc bodies with <<HD<n> placeholders and keep the bodies.
(my $cmd = $raw) =~ s/\\\n/ /g;
my (@heredocs, @shell_fed);
$cmd =~ s{(^|\n)([^\n]*?)<<-?[ \t]*(["']?)(\w+)\3([^\n]*)\n((?:.*?\n)?)[ \t]*\4[ \t]*(?=\n|$)}{
  my ($nl, $pre, $rest, $body) = ($1, $2, $5, $6);
  push @heredocs, $body;
  push @shell_fed, $body if $pre =~ /(?:^|[\s;&|(])(?:ba|z|da)?sh(?:\s|$)/ || $rest =~ /\|\s*(?:\S*\/)?(?:ba|z|da)?sh(?:\s|$)/;
  "$nl$pre<<HD$#heredocs$rest"
}gse;

# Splits text into a code view (quoted strings blanked), a text view (quoted strings kept, commit messages
# blanked) and nested command sources: sh -c / eval strings, $(...) and backticks outside single quotes.
sub scan {
  my ($s) = @_;
  my ($code, $text, @inner) = ('', '');
  while ($s =~ /\G(?:'([^']*)'|"((?:[^"\\]|\\.)*)"|([^'"]+|['"]))/gcs) {
    my ($sq, $dq, $plain) = ($1, $2, $3);
    if (defined $plain) { $code .= $plain; $text .= $plain; next }
    my $body = defined $sq ? $sq : $dq;
    my $tail = substr($code, -80);
    my $is_message = $tail =~ /(?:^|\s)(?:-[A-Za-z]*m|--message=?)\s*$/;
    push @inner, $body if $tail =~ /(?:^|[\s;&|(])(?:(?:ba|z|da)?sh\s+(?:-\w+\s+)*-\w*c|eval)\s*$/;
    if (defined $dq) {
      push @inner, $1 while $dq =~ /(?<!\\)\$\(([^()]*)\)/g;
      push @inner, $1 while $dq =~ /(?<!\\)`((?:[^`\\]|\\.)*)`/g;
    }
    $code .= ' ';
    $text .= $is_message ? ' ' : " $body ";
  }
  push @inner, $1 while $code =~ /\$\(([^()]*)\)/g;
  push @inner, $1 while $code =~ /`([^`]*)`/g;
  return ($code, $text, @inner);
}

my (@codes, @texts, @sources);
my @queue = ($cmd, @shell_fed);
while (@queue && @sources < 30) {
  my $s = shift @queue;
  push @sources, $s;
  my ($c, $t, @inner) = scan($s);
  push @codes, $c;
  push @texts, $t;
  push @queue, @inner;
}
my $code = join "\n", @codes;
my $text = join "\n", @texts;

my $end = qr/(?=\s|$|[;&|)`}])/;
my $seg = qr/[^;&|\n]*/;
my $start = qr/(?:^|[;&|(`{]|\b(?:then|do|else|elif|if|while|until)\b|!)\s*(?:(?:[A-Za-z_]\w*=\S*|env|command|time|nohup|sudo|builtin|exec|npx|nice(?:\s+-n\s*\S+)?|xargs(?:\s+(?:-[IEdLnPs]\s+\S+|-\S+))*)\s+)*/m;
my $git = qr/${start}(?:\S*\/)?git(?:\s+(?:-[Cc]\s+\S+|--(?:git-dir|work-tree|namespace|exec-path)(?:=\S+|\s+\S+)|--[a-z-]+(?:=\S+)?|-[A-Za-z]))*\s+/m;

# Git, processes and the database
decide('block', "push, history rewrites, tags, PR merges and clean need the user's explicit per-request permission; ask the user to run it.")
  if $code =~ /${git}(?:push|reset|rebase|revert|tag|cherry-pick|clean|filter-branch|filter-repo|update-ref)$end/m
  || $code =~ /${start}gh\s+pr\s+merge$end/m;
decide('block', "do not switch branches or use worktrees without the user asking (CLAUDE.md, Commits).")
  if $code =~ /${git}(?:checkout|switch|worktree)$end/m;
decide('block', "deleting, renaming or forcing branches needs the user's explicit permission.")
  if $code =~ /${git}branch\s+(?:$seg\s)?(?:--delete|--move|--force|-(?!-)[A-Za-z]*[dDmMf][A-Za-z]*)(?=\s|$)/m;
if ($code =~ /${git}stash\s+(?:drop|clear)$end/m) {
  decide('block', "discarding uncommitted work needs the user's explicit permission.");
}
while ($code =~ /${git}restore$end($seg)/mg) {
  my $args = $1;
  decide('block', "discarding uncommitted work needs the user's explicit permission.")
    if $args !~ /(?:^|\s)(?:--staged|-S)(?=\s|$)/ || $args =~ /(?:^|\s)(?:--worktree|-W)(?=\s|$)/;
}
decide('block', "stage explicit paths, never git add -A / . / -u / * (CLAUDE.md, Commits).")
  if $code =~ /${git}add\s+(?:$seg\s)?(?:--all|--update|-(?!-)[A-Za-z]*[Au][A-Za-z]*|\.\/?|:\/|\*)(?=\s|$|[;&|)])/m;
decide('block', "stopping processes needs the user's explicit permission; ask the user to do it.")
  if $code =~ /${start}(?:\S*\/)?(?:kill|pkill|killall|kill-port)$end/m
  || $code =~ /${start}(?:\S*\/)?fuser\b$seg\s-\w*k/m;
decide('block', "database scripts and psql need the user's explicit permission.")
  if $code =~ /${start}(?:\S*\/)?psql$end/m || $code =~ /\bexec\b$seg\spsql$end/m;

# Commits, parsed token by token
sub dequote {
  my $t = shift;
  return $1 if $t =~ /^'(.*)'$/s;
  if ($t =~ /^"(.*)"$/s) { (my $v = $1) =~ s/\\(["\\\$`])/$1/g; return $v }
  return $t;
}

sub commands {
  my ($s) = @_;
  my (@all, @cur);
  while ($s =~ /\G\s*(?:('[^']*')|("(?:[^"\\]|\\.)*")|([;&|\n()`{}]+)|([^\s'";&|\n()`{}]+))/gcs) {
    if (defined $3) { push @all, [@cur] if @cur; @cur = (); next }
    push @cur, $1 // $2 // $4;
  }
  push @all, [@cur] if @cur;
  return @all;
}

sub message_value {
  my $v = dequote(shift);
  return $heredocs[$1] if $v =~ /^\$\(\s*cat\s*<<HD(\d+)/;
  return $v;
}

# Runs git in a directory without a shell; returns its trimmed stdout, or undef when git fails.
sub git_out {
  my ($dir, @args) = @_;
  my $pid = open(my $h, '-|') // return undef;
  if (!$pid) { open STDERR, '>', '/dev/null'; exec 'git', '-C', $dir, @args; exit 127 }
  my $out = do { local $/; <$h> } // '';
  close $h or return undef;
  chomp $out;
  return $out;
}

sub is_false { $_[0] =~ /^(?:false|no|off|0)$/i }

# pull and merge are allowed, except a rebasing pull and a merge commit on main.
sub pull_or_merge {
  my ($dir, $config, $foreign, $verb, @args) = @_;
  decide('block', "cannot tell which branch git $verb would change; run it from the repository without GIT_* or --git-dir.")
    if $foreign;
  my $current = git_out($dir, 'branch', '--show-current');
  decide('block', "cannot tell which branch git $verb would change; check the -C path or ask the user to run it.")
    unless defined $current;
  my @opts;
  for my $raw (@args) {
    last if $raw eq '--' || $raw =~ /^#/;
    my $t = dequote($raw);
    push @opts, $t if $t =~ /^-./;
  }
  if ($verb eq 'pull') {
    my ($set) = map { /^pull\.rebase(?:=(.*))?$/is ? ($1 // 'true') : () } reverse @$config;
    $set //= git_out($dir, 'config', "branch.$current.rebase") if $current ne '';
    $set //= git_out($dir, 'config', 'pull.rebase');
    my $rebase = defined $set && !is_false($set);
    for (@opts) {
      if (/^(--[a-z-]+)(?:=(.*))?$/s) {
        my ($name, $value) = ($1, $2);
        if (length $name >= 5 && index('--no-rebase', $name) == 0) { $rebase = 0 }
        elsif (length $name >= 3 && index('--rebase', $name) == 0) { $rebase = !(defined $value && is_false($value)) }
      } elsif (/^-([^-].*)$/s) {
        for my $c (split //, $1) { last if $c =~ /[XsSmFj]/; $rebase = 1 if $c eq 'r' }
      }
    }
    decide('block', "pull --rebase rewrites history; use a merging pull or ask the user to run it.") if $rebase;
  }
  return unless $current eq 'main';
  my %has = map { $_ => 1 } @opts;
  return if $verb eq 'merge' && @opts == 1 && ($has{'--abort'} || $has{'--quit'});
  my %safe = map { $_ => 1 } qw(--ff-only -q --quiet -v --verbose --no-rebase);
  decide('block', "on main only git $verb --ff-only is allowed; never create a merge commit on main.")
    unless $has{'--ff-only'} && !grep { !$safe{$_} } @opts;
}

my $branch;
for my $source (@sources) {
  for my $words (commands($source)) {
    my @w = @$words;
    my $foreign = 0;
    while (@w) {
      if ($w[0] =~ /^([A-Za-z_]\w*)=/) {
        $foreign = 1 if $1 =~ /^GIT_(?:DIR|WORK_TREE|CONFIG\w*|COMMON_DIR|INDEX_FILE)$/;
        my $a = shift @w;
        shift @w if $a =~ /=$/ && @w && $w[0] =~ /^["']/;
      }
      elsif ($w[0] eq 'env') { shift @w; while (@w && $w[0] =~ /^-/) { my $o = shift @w; shift @w if $o =~ /^-[uCS]$/ } }
      elsif ($w[0] =~ /^(?:command|time|nohup|sudo|builtin|exec|nice|then|do|else|elif|if|while|until|!)$/) { shift @w }
      elsif ($w[0] eq "xargs") { shift @w; while (@w && $w[0] =~ /^-/) { my $o = shift @w; shift @w if $o =~ /^-[IEdLnPs]$/ } }
      else { last }
    }
    next unless @w && dequote($w[0]) =~ m{(?:^|/)\\?git$};
    shift @w;
    my ($dir, @config) = ($cwd);
    while (@w && $w[0] =~ /^-/) {
      my $opt = shift @w;
      if ($opt eq '-C') { my $d = dequote(shift(@w) // ''); $dir = $d =~ m{^/} ? $d : "$dir/$d" }
      elsif ($opt eq '-c') { push @config, dequote(shift(@w) // '') }
      elsif ($opt =~ /^-c(.+)$/s) { push @config, dequote($1) }
      elsif ($opt eq '--config-env') { push @config, (dequote(shift(@w) // '') =~ s/=.*$/=env/sr) }
      elsif ($opt =~ /^--config-env=(.*)$/s) { push @config, (dequote($1) =~ s/=.*$/=env/sr) }
      elsif ($opt =~ /^--(?:git-dir|work-tree)(=|$)/) { $foreign = 1; shift @w unless $1 }
      elsif ($opt =~ /^(?:--namespace|--exec-path)$/) { shift @w }
    }
    next unless @w;
    $w[0] = dequote($w[0]);
    pull_or_merge($dir, \@config, $foreign, @w) if $w[0] eq 'pull' || $w[0] eq 'merge';
    if ($w[0] eq 'config') {
      my @v = map { dequote($_) } @w;
      my ($i) = grep { $v[$_] =~ /^(?:pull|branch\..+)\.rebase$/i } 0 .. $#v;
      decide('block', "setting pull.rebase or branch.<name>.rebase makes git pull rewrite history; leave it unset.")
        if defined $i && defined $v[$i + 1] && $v[$i + 1] !~ /^-/ && !is_false($v[$i + 1]);
    }
    next unless $w[0] eq 'commit';
    shift @w;
    my (@messages, $file, $amend, $all);
    for (my $i = 0; $i < @w; $i++) {
      my $t = dequote($w[$i]);
      last if $t eq '--';
      if ($t eq '--amend') { $amend = 1 }
      elsif ($t eq '--all') { $all = 1 }
      elsif ($t =~ /^--message=(.*)$/s) { push @messages, message_value($1 eq '' ? ($w[++$i] // '') : $w[$i] =~ s/^--message=//r) }
      elsif ($t eq '--message') { push @messages, message_value($w[++$i] // '') }
      elsif ($t =~ /^--file=(.*)$/s) { $file = $1 }
      elsif ($t eq '--file') { $file = dequote($w[++$i] // '') }
      elsif ($t =~ /^-([A-Za-z]+)$/) {
        my $flags = $1;
        $all = 1 if $flags =~ /a/;
        if ($flags =~ /m$/) { push @messages, message_value($w[++$i] // '') }
        elsif ($flags =~ /F$/) { $file = dequote($w[++$i] // '') }
      }
    }
    decide('block', "amending needs the user's explicit permission; make a new commit.") if $amend;
    decide('block', "commit -a stages every modified file; stage explicit paths with git add <path>.") if $all;
    $branch //= git_out($cwd, 'branch', '--show-current') // '';
    decide('block', "never commit to main; ask the user which branch to create or switch to.") if $branch eq 'main';
    my $message = join "\n\n", @messages;
    if (defined $file) {
      if ($file eq "-" || $file eq "/dev/stdin") {
        my ($hd) = map { /^<<HD(\d+)/ ? $1 : () } @w;
        $message = defined $hd ? $heredocs[$hd] : '';
      } else {
        my $path = $file =~ m{^/} ? $file : "$cwd/$file";
        $message = '';
        if (open my $h, '<', $path) { local $/; $message = <$h> // '' }
      }
    }
    decide('block', "pass a non-empty commit message with -m or -F; an editor cannot be used here.")
      if $message !~ /\S/;
    my ($subject) = grep { /\S/ } split /\n/, $message;
    decide('block', "the subject must start with '<DE|FE|TD>  - <summary>' (two spaces before the dash).")
      unless $subject =~ /^(?:DE|FE|TD)  - \S/;
    decide('block', "the message must end with a 'Co-Authored-By: Claude <model> <noreply\@anthropic.com>' trailer.")
      unless $message =~ /Co-Authored-By: Claude/;
  }
}

# Hook state and env files: named directly (quoted paths count), through an unquoted glob, or via compose config.
decide('block', "the TDD hook state belongs to the hooks; only the user switches the rule off.")
  if $text =~ /tdd-state/;
my $env_named = 0;
while ($text =~ /(?<![\w.\/-])(?:[\w.\/-]*\/)?(\.env(?:\.[\w-]+)*)(?![\w])/g) { $env_named = 1 if $1 ne '.env.example' }
decide('block', "env files are off limits; use .env.example or ask the user for the value you need.")
  if $env_named
  || $code =~ /(?<![\w.\/-])(?:[\w.\/-]*\/)?\.(?:e[\w.-]*)?[*?\[]/
  || $code =~ /${start}docker(?:\s+compose|-compose)\b$seg\sconfig(?=\s|$)/m;

# Launching or stopping applications
decide('ask', "Starting or stopping an application needs the user's permission (CLAUDE.md, Hard operational limits).")
  if $code =~ /(?:^|[\s:])boot(?:Test)?Run(?=\s|$)/m
  || $code =~ /${start}(?:\S*\/)?java(?:\s+-\S+)*\s+-jar(?=\s|$)/m
  || $code =~ /${start}docker(?:\s+compose|-compose)\b$seg\s(?:up|start|restart|stop|down|kill|rm|run|create|pause)(?=\s|$)/m
  || $code =~ /${start}docker\s+(?:container\s+)?(?:run|start|restart|stop|kill|rm|pause)(?=\s|$)/m
  || $code =~ /${start}npm\b$seg\s(?:dev|preview|start|[\w:-]*serve)(?=\s|$)/m
  || $code =~ /${start}(?:npx\s+)?vite(?:\s+(?:dev|serve|preview)(?=\s|$)|(?=\s+-)|\s*(?=$|[;&|)]))/m
  || $code =~ /${start}docker\s+(?:volume|image|system|container|network)\s+(?:rm|prune)(?=\s|$)/m
  || $code =~ /gradlew\b$seg\s--stop(?=\s|$)/m;

exit 0;
