# gitdiff3d

A git diff is a pile of text. Somebody typed that text, one key at a time, in
some order that made sense to them. `gitdiff3d` plays it back: your diff becomes
a 3d scene where every changed line is a plate floating in space, and a caret
walks through them typing the additions in and erasing the deletions.

![the viewer playing a hunk](docs/screenshot.png)

## Install

```
git clone https://github.com/vdayanand/gitdiff3d
cd gitdiff3d
make install          # symlinks bin/gitdiff3d.js into ~/bin
```

Or run it straight out of the checkout with `node bin/gitdiff3d.js`.

Node 18 or newer. No dependencies: three.js is vendored, everything else is the
standard library and the `git` already on your path.

## Use

```
gitdiff3d                    working tree vs HEAD
gitdiff3d --staged           the index
gitdiff3d HEAD~3..HEAD       a commit range
gitdiff3d main HEAD          two revisions
gitdiff3d -- src/            limit to a path
```

It builds the scene, serves it on a random local port, and opens your browser.

```
--port <n>        listen on port n (default: random)
--max-hunks <n>   keep only the first n hunks (default: all)
--order <how>     story or git (default: story)
--context <n>     lines of unchanged code around each hunk (default: 8)
--json            print the scene model, do not serve
--no-open         serve without opening a browser
```

## Story order

Git prints hunks in path order, which is alphabetical, which is nobody's
thinking. The default `--order story` reorders them the way the change was
probably made: a hunk that introduces a name comes before the hunks that call
that name, and failing that, schema before models before logic before callers
before tests before prose. It is a topological sort over "who defines what",
with the file's role as the tie breaker. `--order git` turns it off.

## Overlay

Press `l` and the old version of the hunk sits behind the new one, both in
frame, separated in depth rather than side by side. This is the one thing a flat
diff cannot do.

![the old version behind the new one](docs/overlay.png)

## Keys

```
space  pause            ,  .  a keystroke back or forward
<  >   a whole line     b  r  rewind this hunk
arrows previous or next hunk       a  autoplay through everything
j / k  scroll           wheel, ctrl-wheel zoom, shift-wheel sideways
drag   orbit            0  refit the camera and follow the caret
c      more or less context (refetched from git)
l      overlay          g / G  fade the front or back plane
t / T  next or previous theme        f  fullscreen
x / X  faster or slower m  keystroke sound      v  speak the file and symbol
?      show or hide the shortcuts
```

Twelve editor themes, dark and light: tokyo night, dracula, one dark, nord,
gruvbox, solarized, github light, one light, gruvbox light, everforest light,
mint. A theme names only the colours an editor names; the papers, rims and
chrome are mixed from those, so nothing needs a table of shades.

## How it works

```
git diff -U8  ->  parse-diff  ->  structure  ->  layout  ->  order  ->  viewer
                  hunks and       which symbol   scene      story     three.js,
                  lines           each hunk is   model      sort      one plate
                                  inside                              per line
```

The server holds the scene model and re-runs the diff only when you ask for a
different context width. Everything the browser needs is one JSON document plus
one HTML file, so the viewer is dumb on purpose: it draws what it is given.

Source structure is understood by regex, not by a real parser. It knows c-like
languages (js, ts, go, rust, java, kotlin, swift, c#, c, c++, php, scala, dart),
python, julia and ruby well enough to name the function a hunk lands in and to
tell a comment-only change from a real one. Other languages still render, they
just get no symbol names and no story order.

Binary files are skipped. Very long lines are clipped to 200 characters.

## Licence

GNU General Public License, version 3 or later. See [LICENSE](LICENSE).

Bundles [three.js](https://threejs.org) r128, which is MIT, and MIT is
compatible with the GPL.
