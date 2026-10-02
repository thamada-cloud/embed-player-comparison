"""Shared helpers for the prototype's browser tests."""
import atexit, collections

# Playwright's pageerror fires for the whole page, SUBFRAMES INCLUDED, and this
# page is mostly cross origin iframes running iHeart's own application. Those
# frames throw their own errors, and a test that treats them as the prototype's
# goes red for reasons nobody here can fix.
#
# The prototype is vanilla JS and reaches the API through one helper, so each
# pattern below is admitted on the same two conditions. It must be a string the
# prototype CANNOT produce, checked against the source rather than eyeballed,
# and it must have been ATTRIBUTED by re-running the suite with the suspect
# embed disabled and nothing else changed.
#
#   React           grep the source. There is no React in it, at all.
#   the 204         our jget throws `new Error(r.status)`, so our own fetch
#                   failures read as a bare number. This sentence is iHeart's.
#   no streams      iHeart's live player, inside the frame. Not in our source.
#
# All three arrived together when the two error examples were added, which
# turned five passing tests red while every assertion inside them still passed.
#
# Filtering a class of error is the kind of thing that hides a real failure
# later, so nothing is swallowed QUIETLY: every drop is counted and printed at
# exit. If a run ever reports a count that looks like the prototype's own
# trouble, that is the signal to go and look rather than to add a fourth line.
_FOREIGN = (
    'Minified React error',
    'react.dev/errors',
    'Server returned unexpected response',
    'There were no streams returned',
)

_dropped = collections.Counter()

def ours(msg):
    """True when a pageerror could have come from the prototype itself."""
    hit = next((p for p in _FOREIGN if p in msg), None)
    if hit is None:
        return True
    _dropped[hit] += 1
    return False

@atexit.register
def _report():
    if _dropped:
        print('  (ignored %d cross origin iframe error%s: %s)'
              % (sum(_dropped.values()), '' if sum(_dropped.values()) == 1 else 's',
                 ', '.join('%s x%d' % (k, v) for k, v in sorted(_dropped.items()))))
