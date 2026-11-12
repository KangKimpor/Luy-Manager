# The app has no reflection over its own classes, so the defaults do the work.
# Resources are the exception: Ui.iconRes looks up "ic_" + name at runtime, which the
# resource shrinker cannot see. res/raw/keep.xml keeps those drawables.

# Keep line numbers readable in a crash report without keeping the full mapping inline.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
